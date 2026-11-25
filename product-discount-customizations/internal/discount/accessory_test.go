package discount

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/mailru/easyjson"
	"github.com/shoplinedev/function-extensions-template/templates/product-discount-customizations/module"
)

// Every fixture crosses the generated request parser and response serializer,
// including metafield JSON and actual SHOPLINE property arrays.
func v2Rule(gifts, bundles string) string {
	r := strings.Replace(testRule(`[{"tierId":"two","quantity":2,"discountType":"none"},{"tierId":"three","quantity":3,"discountType":"none"}]`), `"schemaVersion":1`, `"schemaVersion":2`, 1)
	r = strings.Replace(r, `"productIds":["p1"]`, `"productIds":["p1","p2"]`, 1)
	if gifts != "" {
		r = strings.TrimSuffix(r, "}") + `,"gifts":` + gifts + `}`
	}
	if bundles != "" {
		r = strings.TrimSuffix(r, "}") + `,"bundles":` + bundles + `}`
	}
	return r
}
func offerItem(id, product string, trigger int, quantity int, typ string, value int) string {
	return fmt.Sprintf(`{"ruleId":%q,"displayOrder":%d,"productId":%q,"allowedVariantIds":[%q],"quantity":%d,"discountType":%q,"discountValue":%d,"trigger":{"type":"quantity","operator":"gte","quantity":%d}}`, id, trigger, product, "v-"+product, quantity, typ, value, trigger)
}
func testOfferModule(mode string, items ...string) string {
	return `{"version":1,"enabled":true,"selectionMode":"` + mode + `","quantityMode":"fixed","quotaScope":"main_product","items":[` + strings.Join(items, ",") + `]}`
}
func accessory(id, product, role, rule, source string, q int64) *module.CartLineInput {
	l := testLine(id, product, "10.00", "9.00", q)
	l.Merchandise.ProductVariant.Sku = pointer("v-" + product)
	values := map[string]string{"_qb_protocol": "gift-bundles-v1", "_qb_campaign": "offer-1", "_qb_role": role, "_qb_rule": rule, "_qb_source_product": source, "_qb_context": "ctx-" + id}
	for name, value := range values {
		l.Properties = append(l.Properties, &module.CartLineProperties{Name: pointer(name), Value: pointer(value), Type: pointer("text"), Show: pointer(false), RoleVisibility: pointer("none")})
	}
	return l
}
func setProperty(l *module.CartLineInput, name, value string) {
	for _, p := range l.Properties {
		if *p.Name == name {
			*p.Value = value
			return
		}
	}
}

type v2Target struct {
	Quantity int64
	Amount   string
	Mode     string
	Each     bool
}

func serializedTargets(t *testing.T, rules []string, lines ...*module.CartLineInput) map[string]v2Target {
	t.Helper()
	encoded, err := json.Marshal(testRequestWithRules(rules, lines...))
	if err != nil {
		t.Fatal(err)
	}
	var req module.ProductDiscountCustomizationFunctionRequest
	if err = easyjson.Unmarshal(encoded, &req); err != nil {
		t.Fatal(err)
	}
	out := EvaluateDiscounts(&req)
	encoded, err = easyjson.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	var decoded module.ProductDiscountCustomizationFunctionResponse
	if err = json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	got := map[string]v2Target{}
	for _, d := range decoded.Discounts {
		for _, target := range d.Targets {
			if target.CartLine == nil || target.CartLine.Id == nil || target.CartLine.Quantity == nil {
				t.Fatalf("invalid target %s", encoded)
			}
			id := *target.CartLine.Id
			if _, exists := got[id]; exists {
				t.Fatalf("double-discounted line %s: %s", id, encoded)
			}
			value := target.Value
			if value == nil {
				value = d.Value
			}
			if value == nil {
				t.Fatalf("missing amount: %s", encoded)
			}
			item := v2Target{Quantity: *target.CartLine.Quantity, Mode: "shop"}
			if value.FixedAmount != nil {
				item.Amount = *value.FixedAmount.Amount
				item.Each = *value.FixedAmount.AppliesToEachItem
			} else if value.PresentmentFixedAmount != nil {
				item.Mode = "presentment"
				item.Amount = *value.PresentmentFixedAmount.Amount
				item.Each = *value.PresentmentFixedAmount.AppliesToEachItem
			} else {
				t.Fatalf("unexpected value %s", encoded)
			}
			got[id] = item
		}
	}
	return got
}
func assertTargets(t *testing.T, got, want map[string]v2Target) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("targets got %#v; want %#v", got, want)
	}
}
func TestV2GiftTriggersAccumulateAndVariantsCountOnce(t *testing.T) {
	r := v2Rule(testOfferModule("all_eligible", offerItem("a", "ga", 2, 1, "fixed_price", 0), offerItem("b", "gb", 3, 1, "fixed_price", 0)), "")
	for _, tc := range []struct {
		quantity int64
		want     map[string]v2Target
	}{{2, map[string]v2Target{"ga": {1, "10.00", "shop", false}}}, {4, map[string]v2Target{"ga": {1, "10.00", "shop", false}, "gb": {1, "10.00", "shop", false}}}} {
		t.Run(fmt.Sprint(tc.quantity), func(t *testing.T) {
			assertTargets(t, serializedTargets(t, []string{r}, testLine("main1", "p1", "20.00", "18.00", 1), testLine("main2", "p1", "20.00", "18.00", tc.quantity-1), accessory("ga", "ga", "gift", "a", "p1", 2), accessory("gb", "gb", "gift", "b", "p1", 2)), tc.want)
		})
	}
}
func TestV2CapsArePerSourceProductAndIgnoreContexts(t *testing.T) {
	r := v2Rule(testOfferModule("all_eligible", offerItem("a", "ga", 2, 2, "fixed_price", 0)), "")
	for _, q := range []int64{1, 2, 3} {
		t.Run(fmt.Sprint(q), func(t *testing.T) {
			wantQ := q
			if q == 3 {
				wantQ = 2
			}
			amount := []string{"", "10.00", "20.00"}[wantQ]
			assertTargets(t, serializedTargets(t, []string{r}, testLine("m1", "p1", "20.00", "18.00", 2), accessory("g", "ga", "gift", "a", "p1", q)), map[string]v2Target{"g": {wantQ, amount, "shop", false}})
		})
	}
	assertTargets(t, serializedTargets(t, []string{r}, testLine("m1", "p1", "20.00", "18.00", 2), testLine("m2", "p2", "20.00", "18.00", 2), accessory("a", "ga", "gift", "a", "p1", 1), accessory("b", "ga", "gift", "a", "p1", 3), accessory("c", "ga", "gift", "a", "p2", 3)), map[string]v2Target{"a": {1, "10.00", "shop", false}, "b": {1, "10.00", "shop", false}, "c": {2, "20.00", "shop", false}})
	assertTargets(t, serializedTargets(t, []string{r}, testLine("m1", "p1", "20.00", "18.00", 1), testLine("m2", "p2", "20.00", "18.00", 1), accessory("g", "ga", "gift", "a", "p1", 2)), map[string]v2Target{})
}
func TestV2RejectsForgedAccessoryIdentity(t *testing.T) {
	r := v2Rule(testOfferModule("all_eligible", offerItem("a", "ga", 2, 1, "fixed_price", 0)), "")
	tests := map[string]func(*module.CartLineInput){
		"cross campaign":  func(l *module.CartLineInput) { setProperty(l, "_qb_campaign", "other") },
		"wrong protocol":  func(l *module.CartLineInput) { setProperty(l, "_qb_protocol", "wrong") },
		"main role":       func(l *module.CartLineInput) { setProperty(l, "_qb_role", "main") },
		"wrong role":      func(l *module.CartLineInput) { setProperty(l, "_qb_role", "bundle") },
		"malformed role":  func(l *module.CartLineInput) { setProperty(l, "_qb_role", "") },
		"wrong rule":      func(l *module.CartLineInput) { setProperty(l, "_qb_rule", "other") },
		"wrong source":    func(l *module.CartLineInput) { setProperty(l, "_qb_source_product", "p2") },
		"wrong product":   func(l *module.CartLineInput) { l.Merchandise.ProductVariant.Product.Id = pointer("other") },
		"wrong variant":   func(l *module.CartLineInput) { l.Merchandise.ProductVariant.Sku = pointer("merchant-sku") },
		"missing variant": func(l *module.CartLineInput) { l.Merchandise.ProductVariant.Sku = nil },
		"duplicate role": func(l *module.CartLineInput) {
			l.Properties = append(l.Properties, &module.CartLineProperties{Name: pointer("_qb_role"), Value: pointer("gift")})
		},
		"missing price": func(l *module.CartLineInput) { l.Merchandise.ProductVariant.PriceSet = nil },
		"bad price":     func(l *module.CartLineInput) { l.Merchandise.ProductVariant.PriceSet.ShopMoney.Amount = "+1.00" },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			l := accessory("g", "ga", "gift", "a", "p1", 1)
			mutate(l)
			assertTargets(t, serializedTargets(t, []string{r}, testLine("main", "p1", "20.00", "18.00", 2), l), map[string]v2Target{})
		})
	}
}
func TestV2AccessoriesNeverBecomeMainAndIndependentCaps(t *testing.T) {
	g := testOfferModule("all_eligible", offerItem("a", "ga", 2, 1, "fixed_price", 0))
	b := testOfferModule("multiple", offerItem("b", "gb", 2, 2, "percentage", 5000))
	r := strings.Replace(v2Rule(g, b), `"kind":"products","productIds":["p1","p2"]`, `"kind":"all","productIds":[]`, 1)
	fakeMain := accessory("fake", "ga", "main", "a", "p1", 4)
	assertTargets(t, serializedTargets(t, []string{r}, fakeMain, accessory("g", "ga", "gift", "a", "ga", 1), accessory("b", "gb", "bundle", "b", "ga", 2)), map[string]v2Target{})
	forged := accessory("forged", "p1", "garbage", "a", "p1", 4)
	assertTargets(t, serializedTargets(t, []string{r}, forged, accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{})
	assertTargets(t, serializedTargets(t, []string{r}, testLine("main", "p1", "20.00", "18.00", 2), accessory("g", "ga", "gift", "a", "p1", 2), accessory("b", "gb", "bundle", "b", "p1", 3)), map[string]v2Target{"g": {1, "10.00", "shop", false}, "b": {2, "10.00", "shop", false}})
}
func TestV2BundlesMultipleAndSingleActualSavings(t *testing.T) {
	a := offerItem("a", "ba", 2, 1, "percentage", 9000)
	b := offerItem("b", "bb", 2, 1, "fixed_amount", 500)
	for _, mode := range []string{"multiple", "single"} {
		t.Run(mode, func(t *testing.T) {
			r := v2Rule("", testOfferModule(mode, a, b))
			one := accessory("a", "ba", "bundle", "a", "p1", 1)
			one.Merchandise.ProductVariant.PriceSet.ShopMoney.Amount = "1.00"
			two := accessory("b", "bb", "bundle", "b", "p1", 1)
			want := map[string]v2Target{"b": {1, "5.00", "shop", false}}
			if mode == "multiple" {
				want["a"] = v2Target{1, "0.90", "shop", false}
			}
			assertTargets(t, serializedTargets(t, []string{r}, testLine("main", "p1", "20.00", "18.00", 2), one, two), want)
		})
	}
	// Same saving resolves by displayOrder, then exact ruleId; cart order cannot win.
	a = offerItem("a", "ba", 2, 1, "fixed_amount", 500)
	b = offerItem("b", "bb", 2, 1, "fixed_amount", 500)
	r := v2Rule("", testOfferModule("single", b, a))
	assertTargets(t, serializedTargets(t, []string{r}, testLine("main", "p1", "20.00", "18.00", 2), accessory("b", "bb", "bundle", "b", "p1", 1), accessory("a", "ba", "bundle", "a", "p1", 1)), map[string]v2Target{"a": {1, "5.00", "shop", false}})
}
func TestV2MainAndAccessoriesHaveCompatibleLineTotals(t *testing.T) {
	r := strings.Replace(v2Rule(testOfferModule("all_eligible", offerItem("a", "ga", 2, 1, "fixed_price", 0)), ""), `"discountType":"none"`, `"discountType":"bundle_fixed_amount","discountValue":500`, 1)
	assertTargets(t, serializedTargets(t, []string{r}, testLine("m1", "p1", "10.00", "9.00", 1), testLine("m2", "p1", "20.00", "18.00", 1), accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{"m1": {1, "5.00", "shop", false}, "g": {1, "10.00", "shop", false}})
	// Exact half-up final unit price: 1 cent at 50% has no accessory saving.
	r = v2Rule("", testOfferModule("multiple", offerItem("b", "bb", 2, 2, "percentage", 5000)))
	l := accessory("b", "bb", "bundle", "b", "p1", 2)
	l.Merchandise.ProductVariant.PriceSet.ShopMoney.Amount = "0.01"
	assertTargets(t, serializedTargets(t, []string{r}, testLine("m", "p1", "20.00", "18.00", 2), l), map[string]v2Target{})
}
func TestV2TierTriggersUseHighestReachedTier(t *testing.T) {
	item := strings.Replace(offerItem("a", "ga", 2, 1, "fixed_price", 0), `{"type":"quantity","operator":"gte","quantity":2}`, `{"type":"tiers","tierIds":["two"]}`, 1)
	r := v2Rule(testOfferModule("all_eligible", item), "")
	assertTargets(t, serializedTargets(t, []string{r}, testLine("main", "p1", "20.00", "18.00", 3), accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{})
	assertTargets(t, serializedTargets(t, []string{r}, testLine("main", "p1", "20.00", "18.00", 2), accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{"g": {1, "10.00", "shop", false}})
}

func TestV2MalformedNodesDoNotSuppressIndependentValidNode(t *testing.T) {
	good := v2Rule(testOfferModule("all_eligible", offerItem("a", "ga", 2, 1, "fixed_price", 0)), "")
	for _, bad := range []string{
		strings.Replace(good, `"quantity":1,"discountType"`, `"quantity":0,"discountType"`, 1),
		strings.Replace(good, `"discountValue":0`, `"discountValue":null`, 1),
		strings.Replace(good, `"discountValue":0`, `"discountValue":1`, 1),
		strings.Replace(good, `"discountValue":0`, `"discountValue":0,"discountValue":1`, 1),
		strings.Replace(good, `"discountValue":0`, `"discountValue":9007199254740992`, 1),
		strings.Replace(good, `"productId":"ga"`, `"productId":9007199254740993`, 1),
		strings.Replace(good, `"quantity":2}`, `"quantity":2.5}`, 1),
		strings.Replace(good, `"enabled":true`, `"enabled":null`, 1),
		strings.Replace(good, `"enabled":true`, `"enabled":true,"enabled":false`, 1),
		strings.Replace(good, `"allowedVariantIds":["v-ga"]`, `"allowedVariantIds":[]`, 1),
	} {
		t.Run(bad, func(t *testing.T) {
			bad = strings.Replace(bad, `"campaignId":"offer-1"`, `"campaignId":"bad"`, 1)
			assertTargets(t, serializedTargets(t, []string{bad, good}, testLine("m", "p1", "20.00", "18.00", 2), accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{"g": {1, "10.00", "shop", false}})
		})
	}
}
func TestV2MainInvalidQuantitiesAndDuplicateIDsFailClosed(t *testing.T) {
	r := v2Rule(testOfferModule("all_eligible", offerItem("a", "ga", 2, 1, "fixed_price", 0)), "")
	for name, main := range map[string]*module.CartLineInput{
		"zero":      testLine("bad", "p1", "20.00", "18.00", 0),
		"negative":  testLine("bad", "p1", "20.00", "18.00", -1),
		"unsafe":    testLine("bad", "p1", "20.00", "18.00", 9007199254740992),
		"duplicate": testLine("m", "p1", "20.00", "18.00", 1),
	} {
		t.Run(name, func(t *testing.T) {
			assertTargets(t, serializedTargets(t, []string{r}, testLine("m", "p1", "20.00", "18.00", 2), main, accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{})
		})
	}
	assertTargets(t, serializedTargets(t, []string{r}, testLine("m", "p1", "20.00", "18.00", 2), accessory("g", "ga", "gift", "a", "p1", 1), accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{})
}
func TestV2ScopeOwnershipAndLargeStringIDs(t *testing.T) {
	r := v2Rule(testOfferModule("all_eligible", offerItem("a", "ga", 2, 1, "fixed_price", 0)), "")
	assertTargets(t, serializedTargets(t, []string{r, r}, testLine("main", "p1", "20.00", "18.00", 2), accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{})
	wrongScope := testLine("main", "not-in-scope", "20.00", "18.00", 2)
	assertTargets(t, serializedTargets(t, []string{r}, wrongScope, accessory("g", "ga", "gift", "a", "not-in-scope", 1)), map[string]v2Target{})
	large := "12277057487400872661322470"
	r = strings.ReplaceAll(r, `"ga"`, `"`+large+`"`)
	r = strings.ReplaceAll(r, "v-ga", "v-"+large)
	assertTargets(t, serializedTargets(t, []string{r}, testLine("main", "p1", "20.00", "18.00", 2), accessory("g", large, "gift", "a", "p1", 1)), map[string]v2Target{"g": {1, "10.00", "shop", false}})
}
func TestV2MixedLegacyNodesCannotReuseAccessoryAsMain(t *testing.T) {
	r := v2Rule(testOfferModule("all_eligible", offerItem("a", "ga", 2, 1, "fixed_price", 0)), "")
	legacy := strings.Replace(testRule(`[{"tierId":"one","quantity":1,"discountType":"percentage","discountValue":5000}]`), `"productIds":["p1"]`, `"productIds":["ga"]`, 1)
	assertTargets(t, serializedTargets(t, []string{legacy, r}, testLine("m", "p1", "20.00", "18.00", 2), accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{"g": {1, "10.00", "shop", false}})
	// A malformed v2 node must not let legacy nodes count accessory-marked units.
	bad := strings.Replace(r, `"quantity":1,"discountType"`, `"quantity":0,"discountType"`, 1)
	assertTargets(t, serializedTargets(t, []string{legacy, bad}, testLine("m", "p1", "20.00", "18.00", 2), accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{})
}
func TestV2MoneyModesCannotMixAcrossModulesOrLegacyOutputs(t *testing.T) {
	item := offerItem("b", "bb", 2, 1, "fixed_amount", 500)
	marketItem := strings.Replace(item, `"trigger":`, `"marketOverrides":{"market-eu":{"mode":"specified_amount","amountMinor":200,"currencyCode":"EUR","currencyDecimals":2}},"trigger":`, 1)
	r := v2Rule(testOfferModule("all_eligible", offerItem("a", "ga", 2, 1, "fixed_price", 0)), testOfferModule("multiple", marketItem))
	assertTargets(t, serializedTargets(t, []string{r}, testLine("m", "p1", "20.00", "18.00", 2), accessory("g", "ga", "gift", "a", "p1", 1), accessory("b", "bb", "bundle", "b", "p1", 1)), map[string]v2Target{})
	// Single selection must never numerically compare unlike currencies.
	r = v2Rule("", testOfferModule("single", offerItem("a", "ba", 2, 1, "fixed_amount", 500), marketItem))
	assertTargets(t, serializedTargets(t, []string{r}, testLine("m", "p1", "20.00", "18.00", 2), accessory("a", "ba", "bundle", "a", "p1", 1), accessory("b", "bb", "bundle", "b", "p1", 1)), map[string]v2Target{})
	// Compatible presentment-only nodes use actual EUR price and keep line totals.
	r = v2Rule("", testOfferModule("multiple", marketItem))
	assertTargets(t, serializedTargets(t, []string{r}, testLine("m", "p1", "20.00", "18.00", 2), accessory("b", "bb", "bundle", "b", "p1", 1)), map[string]v2Target{"b": {1, "2.00", "presentment", false}})
	legacy := strings.Replace(testRule(`[{"tierId":"one","quantity":1,"discountType":"fixed_amount","discountValue":100}]`), `"productIds":["p1"]`, `"productIds":["legacy"]`, 1)
	assertTargets(t, serializedTargets(t, []string{legacy, r}, testLine("legacy", "legacy", "10.00", "9.00", 1), testLine("m", "p1", "20.00", "18.00", 2), accessory("b", "bb", "bundle", "b", "p1", 1)), map[string]v2Target{"legacy": {1, "1.00", "shop", true}})
}
func TestV2QuantityOperatorsAndCapsReduction(t *testing.T) {
	for _, tc := range []struct {
		op       string
		qty      int64
		discount bool
	}{{"eq", 2, true}, {"eq", 3, false}, {"gt", 2, false}, {"gt", 3, true}, {"gte", 3, true}} {
		item := strings.Replace(offerItem("b", "bb", 2, 2, "fixed_amount", 999999), `"operator":"gte"`, `"operator":"`+tc.op+`"`, 1)
		r := v2Rule("", testOfferModule("multiple", item))
		want := map[string]v2Target{}
		if tc.discount {
			want["b"] = v2Target{2, "20.00", "shop", false}
		}
		assertTargets(t, serializedTargets(t, []string{r}, testLine("m", "p1", "20.00", "18.00", tc.qty), accessory("b", "bb", "bundle", "b", "p1", 3)), want)
	}
}

func TestV2MissingCurrencyPrecisionNeverCreatesFreeItems(t *testing.T) {
	r := strings.Replace(v2Rule("", testOfferModule("multiple", offerItem("b", "bb", 2, 1, "fixed_amount", 500))), `"storeCurrencyDecimals":2,`, "", 1)
	b := accessory("b", "bb", "bundle", "b", "p1", 1)
	b.Merchandise.ProductVariant.PriceSet.ShopMoney.Amount = "10"
	assertTargets(t, serializedTargets(t, []string{r}, testLine("m", "p1", "20", "18", 2), b), map[string]v2Target{})
}
func TestV1StillIgnoresUnrecognizedOfferFields(t *testing.T) {
	r := strings.TrimSuffix(testRule(`[{"tierId":"one","quantity":1,"discountType":"fixed_amount","discountValue":100}]`), "}") + `,"gifts":"unknown legacy extension","bundles":false}`
	assertTargets(t, serializedTargets(t, []string{r}, testLine("m", "p1", "10.00", "9.00", 1)), map[string]v2Target{"m": {1, "1.00", "shop", true}})
}

func TestV2EmptyAccessoryLineIDAndUnrepresentableTotalsFailClosed(t *testing.T) {
	r := v2Rule(testOfferModule("all_eligible", offerItem("a", "ga", 2, 2, "fixed_price", 0)), "")
	blank := accessory("", "ga", "gift", "a", "p1", 1)
	assertTargets(t, serializedTargets(t, []string{r}, testLine("m", "p1", "20.00", "18.00", 2), blank), map[string]v2Target{})
	huge := accessory("g", "ga", "gift", "a", "p1", 2)
	huge.Merchandise.ProductVariant.PriceSet.ShopMoney.Amount = "92233720368547758.07"
	assertTargets(t, serializedTargets(t, []string{r}, testLine("m", "p1", "20.00", "18.00", 2), huge), map[string]v2Target{})
}
func TestV2PreservesMainCampaignAmountsAcrossDiscountKinds(t *testing.T) {
	for _, tc := range []struct {
		kind   string
		value  int
		amount string
	}{{"percentage", 2500, "5.00"}, {"fixed_amount", 500, "10.00"}, {"fixed_price", 500, "10.00"}, {"bundle_fixed_amount", 500, "5.00"}, {"bundle_fixed_price", 500, "15.00"}} {
		t.Run(tc.kind, func(t *testing.T) {
			r := strings.Replace(v2Rule(testOfferModule("all_eligible", offerItem("a", "ga", 2, 1, "fixed_price", 0)), ""), `"discountType":"none"`, fmt.Sprintf(`"discountType":%q,"discountValue":%d`, tc.kind, tc.value), 1)
			assertTargets(t, serializedTargets(t, []string{r}, testLine("m", "p1", "10.00", "9.00", 2), accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{"m": {2, tc.amount, "shop", false}, "g": {1, "10.00", "shop", false}})
		})
	}
}
func TestV2CollectionOwnershipUsesActualMembership(t *testing.T) {
	r := strings.Replace(v2Rule(testOfferModule("all_eligible", offerItem("a", "ga", 2, 1, "fixed_price", 0)), ""), `"kind":"products","productIds":["p1","p2"]`, `"kind":"collections","collectionIds":["c1"],"resolvedProductIds":["p1"]`, 1)
	m := testLine("m", "p1", "20.00", "18.00", 2)
	assertTargets(t, serializedTargets(t, []string{r}, m, accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{})
	m.Merchandise.ProductVariant.Product.InCollections = []*module.CollectionMembership{{CollectionId: pointer("c1"), IsMember: pointer(true)}}
	assertTargets(t, serializedTargets(t, []string{r}, m, accessory("g", "ga", "gift", "a", "p1", 1)), map[string]v2Target{"g": {1, "10.00", "shop", false}})
}
