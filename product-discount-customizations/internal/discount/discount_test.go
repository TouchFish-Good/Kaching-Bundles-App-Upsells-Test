package discount

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"testing"

	"github.com/shoplinedev/function-extensions-template/templates/product-discount-customizations/module"
)

func pointer[T any](value T) *T { return &value }

func testLine(id, product, shopPrice, marketPrice string, quantity int64) *module.CartLineInput {
	return &module.CartLineInput{
		Id: pointer(id), Quantity: pointer(quantity),
		Merchandise: &module.MerchandiseInput{ProductVariant: &module.ProductVariantInput{
			Product:  &module.ProductInput{Id: pointer(product)},
			PriceSet: &module.MoneySet{ShopMoney: &module.Money{Amount: shopPrice, CurrencyCode: "USD"}, PresentmentMoney: &module.Money{Amount: marketPrice, CurrencyCode: "EUR"}},
		}},
	}
}

func testRule(tiers string) string {
	return `{"schemaVersion":1,"campaignId":"offer-1","storeCurrencyCode":"USD","storeCurrencyDecimals":2,"scope":{"kind":"products","productIds":["p1"],"excludedProductIds":[]},"tiers":` + tiers + `}`
}

func testRequest(rule string, lines ...*module.CartLineInput) *module.ProductDiscountCustomizationFunctionRequest {
	return testRequestWithRules([]string{rule}, lines...)
}

func testRequestWithRules(rules []string, lines ...*module.CartLineInput) *module.ProductDiscountCustomizationFunctionRequest {
	nodes := make([]*module.DiscountNode, 0, len(rules))
	for index, rule := range rules {
		nodes = append(nodes, &module.DiscountNode{PriceRuleId: pointer("rule-" + strconv.Itoa(index+1)), Metafields: []*module.Metafield{{Namespace: pointer("sale"), Key: "quantity_breaks", Type: "json", Value: rule}}})
	}
	return &module.ProductDiscountCustomizationFunctionRequest{
		Cart:          &module.CartInput{Lines: lines},
		DiscountNodes: nodes,
		Localization:  &module.LocalizationInput{MarketId: pointer("market-eu")},
	}
}

func TestSpecifiedProductRuleOverridesCollectionRule(t *testing.T) {
	direct := testRule(`[{"tierId":"two","quantity":2,"discountType":"percentage","discountValue":1000}]`)
	collection := strings.Replace(testRule(`[{"tierId":"two","quantity":2,"discountType":"percentage","discountValue":2000}]`),
		`"kind":"products","productIds":["p1"],"excludedProductIds":[]`,
		`"kind":"collections","collectionIds":["c1"],"excludedProductIds":[]`, 1)
	line := testLine("line-1", "p1", "100.00", "90.00", 2)
	line.Merchandise.ProductVariant.Product.InCollections = []*module.CollectionMembership{{CollectionId: pointer("c1"), IsMember: pointer(true)}}

	result := EvaluateDiscounts(testRequestWithRules([]string{collection, direct}, line))
	if len(result.Discounts) != 1 {
		t.Fatalf("expected only the specified-product discount, got %+v", result)
	}
	if got := *result.Discounts[0].PriceRuleId; got != "rule-2" {
		t.Fatalf("got price rule %s, want the specified-product rule", got)
	}
	if got := *result.Discounts[0].Targets[0].Value.FixedAmount.Amount; got != "10.00" {
		t.Fatalf("got discount %s, want the specified-product amount", got)
	}
}

func TestOverlappingCollectionRulesAreReturnedForPlatformPriority(t *testing.T) {
	first := strings.Replace(testRule(`[{"tierId":"two","quantity":2,"discountType":"percentage","discountValue":1000}]`),
		`"kind":"products","productIds":["p1"],"excludedProductIds":[]`,
		`"kind":"collections","collectionIds":["c1"],"excludedProductIds":[]`, 1)
	second := strings.Replace(testRule(`[{"tierId":"two","quantity":2,"discountType":"percentage","discountValue":2000}]`),
		`"kind":"products","productIds":["p1"],"excludedProductIds":[]`,
		`"kind":"collections","collectionIds":["c2"],"excludedProductIds":[]`, 1)
	line := testLine("line-1", "p1", "100.00", "90.00", 2)
	line.Merchandise.ProductVariant.Product.InCollections = []*module.CollectionMembership{
		{CollectionId: pointer("c1"), IsMember: pointer(true)},
		{CollectionId: pointer("c2"), IsMember: pointer(true)},
	}
	if result := EvaluateDiscounts(testRequestWithRules([]string{first, second}, line)); len(result.Discounts) != 2 {
		t.Fatalf("collection rules must reach SHOPLINE priority resolution, got %+v", result)
	}
}

func TestMixedVariantsReachHighestTier(t *testing.T) {
	rule := testRule(`[{"tierId":"one","quantity":1,"discountType":"none"},{"tierId":"two","quantity":2,"discountType":"percentage","discountValue":1000},{"tierId":"three","quantity":3,"discountType":"percentage","discountValue":2000},{"tierId":"five","quantity":5,"discountType":"percentage","discountValue":3000}]`)
	for _, test := range []struct {
		quantity int64
		expected string
	}{{1, ""}, {2, "10.00"}, {3, "20.00"}, {4, "20.00"}, {5, "30.00"}, {6, "30.00"}} {
		t.Run(string(rune('0'+test.quantity)), func(t *testing.T) {
			first := testLine("line-a", "p1", "100.00", "90.00", 1)
			second := testLine("line-b", "p1", "200.00", "180.00", test.quantity-1)
			result := EvaluateDiscounts(testRequest(rule, first, second))
			if test.expected == "" {
				if len(result.Discounts) != 0 {
					t.Fatalf("expected no discount, got %+v", result)
				}
				return
			}
			if len(result.Discounts) != 1 || len(result.Discounts[0].Targets) != 2 {
				t.Fatalf("expected two variant targets, got %+v", result)
			}
			if actual := *result.Discounts[0].Targets[0].Value.FixedAmount.Amount; actual != test.expected {
				t.Fatalf("first variant: got %s, want %s", actual, test.expected)
			}
			if *result.Discounts[0].Targets[1].CartLine.Quantity != test.quantity-1 {
				t.Fatal("second variant quantity was lost")
			}
		})
	}
}

func TestFixedAmountAndFixedPriceRespectVariantPrice(t *testing.T) {
	for _, test := range []struct {
		discountType string
		value        int
		expected     []string
	}{
		{"fixed_amount", 3000, []string{"30.00", "20.00"}},
		{"fixed_price", 5000, []string{"50.00", "0.00"}},
	} {
		rule := testRule(`[{"tierId":"two","quantity":2,"discountType":"` + test.discountType + `","discountValue":` + strconv.Itoa(test.value) + `}]`)
		result := EvaluateDiscounts(testRequest(rule, testLine("a", "p1", "100.00", "90.00", 1), testLine("b", "p1", "20.00", "18.00", 1)))
		if len(result.Discounts) != 1 {
			t.Fatalf("%s: expected one discount", test.discountType)
		}
		if test.discountType == "fixed_price" && len(result.Discounts[0].Targets) != 1 {
			t.Fatal("zero-discount variant should not receive a target")
		}
		for index, target := range result.Discounts[0].Targets {
			if got := *target.Value.FixedAmount.Amount; got != test.expected[index] {
				t.Fatalf("%s target %d: got %s", test.discountType, index, got)
			}
		}
	}
}

func TestBundleAmountAndBundlePriceApplyOnceAcrossEligibleProductLines(t *testing.T) {
	for _, test := range []struct {
		discountType string
		value        int
		expected     string
	}{
		{"bundle_fixed_amount", 3000, "30.00"},
		{"bundle_fixed_price", 5000, "70.00"},
	} {
		rule := testRule(`[{"tierId":"two","quantity":2,"discountType":"` + test.discountType + `","discountValue":` + strconv.Itoa(test.value) + `}]`)
		result := EvaluateDiscounts(testRequest(rule, testLine("a", "p1", "100.00", "90.00", 1), testLine("b", "p1", "20.00", "18.00", 1)))
		if len(result.Discounts) != 1 {
			t.Fatalf("%s: expected one product-group discount, got %+v", test.discountType, result)
		}
		discount := result.Discounts[0]
		if len(discount.Targets) != 2 || discount.Value == nil || discount.Value.FixedAmount == nil {
			t.Fatalf("%s: expected two targets with one fixed amount value, got %+v", test.discountType, discount)
		}
		if actual := *discount.Value.FixedAmount.Amount; actual != test.expected || *discount.Value.FixedAmount.AppliesToEachItem {
			t.Fatalf("%s: got %+v, want amount %s applied once", test.discountType, discount.Value.FixedAmount, test.expected)
		}
		for _, target := range discount.Targets {
			if target.Value != nil {
				t.Fatalf("%s: target value must be empty because the discount applies to the product group", test.discountType)
			}
		}
	}
}

func TestBundleDiscountSkipsAProductGroupWithAnUnpriceableLine(t *testing.T) {
	rule := testRule(`[{"tierId":"two","quantity":2,"discountType":"bundle_fixed_amount","discountValue":3000}]`)
	priced := testLine("priced", "p1", "100.00", "90.00", 1)
	unpriceable := testLine("unpriceable", "p1", "20.00", "18.00", 1)
	unpriceable.Merchandise.ProductVariant.PriceSet = nil
	if result := EvaluateDiscounts(testRequest(rule, priced, unpriceable)); len(result.Discounts) != 0 {
		t.Fatalf("a bundle discount must not use an unpriceable line to meet its threshold: %+v", result)
	}
}

func TestInvalidOrExcludedRulesFailClosed(t *testing.T) {
	for _, rule := range []string{"not-json", testRule(`[{"quantity":2,"discountType":"percentage","discountValue":20000}]`), testRule(`[{"tierId":"x","quantity":2,"discountType":"percentage","discountValue":0}]`)} {
		result := EvaluateDiscounts(testRequest(rule, testLine("a", "p1", "100.00", "90.00", 2)))
		if len(result.Discounts) != 0 {
			t.Fatalf("unexpected discount for %s", rule)
		}
	}
	rule := testRule(`[{"tierId":"two","quantity":2,"discountType":"percentage","discountValue":2000}]`)
	result := EvaluateDiscounts(testRequest(rule, testLine("a", "p2", "100.00", "90.00", 2)))
	if len(result.Discounts) != 0 {
		t.Fatal("another Product must not count")
	}
}

func TestSpecifiedMarketAmountAndConflictingProductRules(t *testing.T) {
	rule := testRule(`[{"tierId":"two","quantity":2,"discountType":"fixed_amount","discountValue":1000,"marketOverrides":{"market-eu":{"mode":"specified_amount","amountMinor":700,"currencyCode":"EUR","currencyDecimals":2}}}]`)
	result := EvaluateDiscounts(testRequest(rule, testLine("a", "p1", "100.00", "90.00", 1), testLine("b", "p1", "100.00", "90.00", 1)))
	if len(result.Discounts) != 1 || result.Discounts[0].Targets[0].Value.PresentmentFixedAmount == nil {
		t.Fatalf("market amount missing: %+v", result)
	}
	if got := *result.Discounts[0].Targets[0].Value.PresentmentFixedAmount.Amount; got != "7.00" {
		t.Fatalf("got %s", got)
	}
	other := testRequest(testRule(`[{"tierId":"two","quantity":2,"discountType":"percentage","discountValue":1000}]`), testLine("b", "p1", "100.00", "90.00", 2))
	result.Discounts = nil
	request := testRequest(rule, testLine("a", "p1", "100.00", "90.00", 2))
	request.DiscountNodes = append(request.DiscountNodes, other.DiscountNodes[0])
	request.DiscountNodes[1].PriceRuleId = pointer("rule-2")
	if len(EvaluateDiscounts(request).Discounts) != 0 {
		t.Fatal("conflicting specified-product rules must fail closed")
	}
}

func mixedTierRule(shopType, marketType string) string {
	rule := testRule(fmt.Sprintf(`[
		{"tierId":"two","quantity":2,"discountType":%q,"discountValue":1000,"marketOverrides":{"market-eu":{"mode":"auto_convert"}}},
		{"tierId":"three","quantity":3,"discountType":%q,"discountValue":2000,"marketOverrides":{"market-eu":{"mode":"specified_amount","amountMinor":700,"currencyCode":"EUR","currencyDecimals":2}}}
	]`, shopType, marketType))
	return strings.Replace(rule, `"productIds":["p1"]`, `"productIds":["p-shop","p-market"]`, 1)
}

func TestMixedTierModesUseHighestTierAndIndependentOutputs(t *testing.T) {
	for _, test := range []struct {
		name, shopType, marketType string
		shopAmounts, marketAmounts []string
		bundle                     bool
	}{
		{"percentage", "percentage", "fixed_amount", []string{"10.00", "2.00"}, []string{"7.00", "7.00"}, false},
		{"fixed amount", "fixed_amount", "fixed_amount", []string{"10.00", "10.00"}, []string{"7.00", "7.00"}, false},
		{"fixed price", "fixed_price", "fixed_price", []string{"90.00", "10.00"}, []string{"83.00", "23.00"}, false},
		{"bundle fixed amount", "bundle_fixed_amount", "bundle_fixed_amount", []string{"10.00"}, []string{"7.00"}, true},
		{"bundle fixed price", "bundle_fixed_price", "bundle_fixed_price", []string{"110.00"}, []string{"173.00"}, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			result := EvaluateDiscounts(testRequest(mixedTierRule(test.shopType, test.marketType),
				testLine("shop-a", "p-shop", "100.00", "90.00", 1),
				testLine("shop-b", "p-shop", "20.00", "18.00", 1),
				testLine("market-a", "p-market", "100.00", "90.00", 1),
				testLine("market-b", "p-market", "50.00", "30.00", 3)))
			if len(result.Discounts) != 2 {
				t.Fatalf("want independent shop and market outputs for the same rule, got %+v", result)
			}
			seen := map[string]bool{}
			for _, discount := range result.Discounts {
				if *discount.PriceRuleId != "rule-1" || len(discount.Targets) != 2 {
					t.Fatalf("must preserve one activity and both product-group lines: %+v", discount)
				}
				market := strings.HasPrefix(*discount.Targets[0].CartLine.Id, "market-")
				prefix, amounts := "shop-", test.shopAmounts
				if market {
					prefix, amounts = "market-", test.marketAmounts
				}
				if seen[prefix] {
					t.Fatalf("duplicate output bucket %s", prefix)
				}
				seen[prefix] = true
				for index, target := range discount.Targets {
					if *target.CartLine.Id != prefix+[]string{"a", "b"}[index] {
						t.Fatalf("mixed product targets in output: %+v", discount)
					}
					wantQuantity := int64(1)
					if market && index == 1 {
						wantQuantity = 3
					}
					if *target.CartLine.Quantity != wantQuantity {
						t.Fatalf("lost target quantity: %+v", target)
					}
					value := target.Value
					if test.bundle {
						if value != nil {
							t.Fatal("bundle amount must apply once at group level")
						}
						value = discount.Value
					} else if discount.Value != nil {
						t.Fatal("per-item amounts must remain on targets")
					}
					amountIndex := index
					if test.bundle {
						amountIndex = 0
					}
					if market {
						if value == nil || value.FixedAmount != nil || value.PresentmentFixedAmount == nil {
							t.Fatalf("want presentment value, got %+v", value)
						}
						money := value.PresentmentFixedAmount
						if *money.Currency != "EUR" || *money.Amount != amounts[amountIndex] || *money.AppliesToEachItem == test.bundle {
							t.Fatalf("wrong market value: %+v", money)
						}
					} else {
						if value == nil || value.PresentmentFixedAmount != nil || value.FixedAmount == nil {
							t.Fatalf("want shop USD value, got %+v", value)
						}
						money := value.FixedAmount
						if *money.Amount != amounts[amountIndex] || *money.AppliesToEachItem == test.bundle {
							t.Fatalf("wrong shop USD value: %+v", money)
						}
					}
				}
			}
		})
	}
}

func TestMixedModesAcrossIndependentRules(t *testing.T) {
	shop := testRule(`[{"tierId":"two","quantity":2,"discountType":"fixed_amount","discountValue":1000}]`)
	market := strings.Replace(testRule(`[{"tierId":"two","quantity":2,"discountType":"fixed_amount","discountValue":1000,"marketOverrides":{"market-eu":{"mode":"specified_amount","amountMinor":700,"currencyCode":"EUR","currencyDecimals":2}}}]`), `"productIds":["p1"]`, `"productIds":["p2"]`, 1)
	result := EvaluateDiscounts(testRequestWithRules([]string{shop, market}, testLine("shop", "p1", "100.00", "90.00", 2), testLine("market", "p2", "100.00", "90.00", 2)))
	if len(result.Discounts) != 2 || result.Discounts[0].Targets[0].Value.FixedAmount == nil || result.Discounts[1].Targets[0].Value.PresentmentFixedAmount == nil {
		t.Fatalf("independent valid rules must retain both output types: %+v", result)
	}
}

func TestMixedPresentmentCurrenciesAndPrecisionsStayPartitioned(t *testing.T) {
	rule := mixedTierRule("fixed_amount", "fixed_amount")
	rule = strings.Replace(rule, `"mode":"auto_convert"`, `"mode":"specified_amount","amountMinor":1000,"currencyCode":"JPY","currencyDecimals":0`, 1)
	shop := testLine("yen", "p-shop", "100.00", "2000", 2)
	shop.Merchandise.ProductVariant.PriceSet.PresentmentMoney.CurrencyCode = "JPY"
	market := testLine("euro", "p-market", "100.00", "90.00", 4)
	result := EvaluateDiscounts(testRequest(rule, shop, market))
	if len(result.Discounts) != 2 {
		t.Fatalf("distinct currencies/precision must have independent outputs: %+v", result)
	}
	want := map[string]string{"JPY": "1000", "EUR": "7.00"}
	for _, discount := range result.Discounts {
		if len(discount.Targets) != 1 || discount.Targets[0].Value.PresentmentFixedAmount == nil {
			t.Fatalf("expected one presentment target per currency: %+v", discount)
		}
		value := discount.Targets[0].Value.PresentmentFixedAmount
		if amount, ok := want[*value.Currency]; !ok || *value.Amount != amount {
			t.Fatalf("wrong currency amount: %+v", value)
		}
		delete(want, *value.Currency)
	}
	if len(want) != 0 {
		t.Fatalf("missing currency outputs: %+v", want)
	}
}

func TestMixedInvalidMoneyCannotReturnPartialDiscounts(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func(*module.MoneySet)
	}{
		{"missing presentment money", func(prices *module.MoneySet) { prices.PresentmentMoney = nil }},
		{"wrong currency", func(prices *module.MoneySet) { prices.PresentmentMoney.CurrencyCode = "GBP" }},
		{"negative price", func(prices *module.MoneySet) { prices.PresentmentMoney.Amount = "-1.00" }},
		{"invalid precision", func(prices *module.MoneySet) { prices.PresentmentMoney.Amount = "1.001" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			rule := strings.Replace(testRule(`[{"tierId":"one","quantity":1,"discountType":"fixed_amount","discountValue":1000,"marketOverrides":{"market-eu":{"mode":"specified_amount","amountMinor":700,"currencyCode":"EUR","currencyDecimals":2}}}]`), `"productIds":["p1"]`, `"productIds":["p1","p2"]`, 1)
			invalid := testLine("invalid", "p2", "100.00", "90.00", 1)
			test.mutate(invalid.Merchandise.ProductVariant.PriceSet)
			result := EvaluateDiscounts(testRequest(rule, testLine("valid", "p1", "100.00", "90.00", 1), invalid))
			if len(result.Discounts) != 0 {
				t.Fatalf("invalid monetary data emitted partial output: %+v", result)
			}
		})
	}
}

func TestMixedValidInvalidRulesPreserveInvalidNodeSkip(t *testing.T) {
	valid := testRule(`[{"tierId":"one","quantity":1,"discountType":"fixed_amount","discountValue":1000}]`)
	market := testRule(`[{"tierId":"one","quantity":1,"discountType":"fixed_amount","discountValue":1000,"marketOverrides":{"market-eu":{"mode":"specified_amount","amountMinor":700,"currencyCode":"EUR","currencyDecimals":2}}}]`)
	for _, invalid := range []string{
		"not-json",
		strings.Replace(market, `"amountMinor":700`, `"amountMinor":-1`, 1),
		strings.Replace(market, `"currencyDecimals":2`, `"currencyDecimals":4`, 1),
		strings.Replace(market, `"currencyCode":"EUR"`, `"currencyCode":"EU"`, 1),
	} {
		invalid = strings.Replace(invalid, `"productIds":["p1"]`, `"productIds":["p2"]`, 1)
		for _, rules := range [][]string{{valid, invalid}, {invalid, valid}} {
			result := EvaluateDiscounts(testRequestWithRules(rules, testLine("valid", "p1", "100.00", "90.00", 1), testLine("invalid", "p2", "100.00", "90.00", 1)))
			if len(result.Discounts) != 1 || len(result.Discounts[0].Targets) != 1 || *result.Discounts[0].Targets[0].CartLine.Id != "valid" {
				t.Fatalf("invalid node must remain skipped without suppressing valid independent rule: %+v", result)
			}
		}
	}
}

func TestMixedUnpriceableBundleCannotReturnPartialDiscounts(t *testing.T) {
	rule := strings.Replace(testRule(`[{"tierId":"two","quantity":2,"discountType":"bundle_fixed_amount","discountValue":1000}]`), `"productIds":["p1"]`, `"productIds":["p1","p2"]`, 1)
	unpriceable := testLine("unpriceable", "p2", "100.00", "90.00", 1)
	unpriceable.Merchandise.ProductVariant.PriceSet = nil
	result := EvaluateDiscounts(testRequest(rule, testLine("valid", "p1", "100.00", "90.00", 2), testLine("priced", "p2", "100.00", "90.00", 1), unpriceable))
	if len(result.Discounts) != 0 {
		t.Fatalf("unpriceable bundle emitted partial output: %+v", result)
	}
}

func TestRuleJSONIsWellFormed(t *testing.T) {
	if !json.Valid([]byte(testRule(`[]`))) {
		t.Fatal("test fixture must be JSON")
	}
}

func TestPercentageHandlesLargeRepresentablePrice(t *testing.T) {
	rule := testRule(`[{"tierId":"one","quantity":1,"discountType":"percentage","discountValue":1000}]`)
	result := EvaluateDiscounts(testRequest(rule, testLine("a", "p1", "922337203685477.58", "1.00", 1)))
	if len(result.Discounts) != 1 || len(result.Discounts[0].Targets) != 1 {
		t.Fatalf("expected one discount target, got %+v", result)
	}
	if got := *result.Discounts[0].Targets[0].Value.FixedAmount.Amount; got != "92233720368547.76" {
		t.Fatalf("got %s, want 92233720368547.76", got)
	}
}

func TestProductsCountSeparatelyAndExcludeBeforeCounting(t *testing.T) {
	rule := strings.Replace(testRule(`[{"tierId":"two","quantity":2,"discountType":"percentage","discountValue":2500}]`),
		`"kind":"products","productIds":["p1"],"excludedProductIds":[]`,
		`"kind":"all","productIds":[],"excludedProductIds":["excluded"]`, 1)
	result := EvaluateDiscounts(testRequest(rule,
		testLine("p1-a", "p1", "100.00", "90.00", 1),
		testLine("p2-a", "p2", "100.00", "90.00", 1),
		testLine("excluded", "excluded", "100.00", "90.00", 3)))
	if len(result.Discounts) != 0 {
		t.Fatalf("different products and excluded lines must not form a tier: %+v", result)
	}
	result = EvaluateDiscounts(testRequest(rule,
		testLine("p1-a", "p1", "100.00", "90.00", 1),
		testLine("p1-b", "p1", "80.00", "72.00", 1),
		testLine("p2-a", "p2", "100.00", "90.00", 2)))
	if len(result.Discounts) != 1 || len(result.Discounts[0].Targets) != 3 {
		t.Fatalf("expected separate targets for each eligible product line: %+v", result)
	}
	for _, target := range result.Discounts[0].Targets {
		if *target.CartLine.Id == "p2-a" && *target.CartLine.Quantity != 2 {
			t.Fatal("second product quantity changed")
		}
	}
}

func TestCollectionSnapshotHonorsProductExclusion(t *testing.T) {
	rule := strings.Replace(testRule(`[{"tierId":"two","quantity":2,"discountType":"fixed_amount","discountValue":500}]`),
		`"kind":"products","productIds":["p1"],"excludedProductIds":[]`,
		`"kind":"collections","collectionIds":["c1"],"resolvedProductIds":["p1","p2"],"excludedProductIds":["p2"]`, 1)
	first := testLine("a", "p1", "10.00", "9.00", 2)
	first.Merchandise.ProductVariant.Product.InCollections = []*module.CollectionMembership{{CollectionId: pointer("c1"), IsMember: pointer(true)}}
	second := testLine("b", "p2", "10.00", "9.00", 2)
	second.Merchandise.ProductVariant.Product.InCollections = []*module.CollectionMembership{{CollectionId: pointer("c1"), IsMember: pointer(true)}}
	result := EvaluateDiscounts(testRequest(rule, first, second))
	if len(result.Discounts) != 1 || len(result.Discounts[0].Targets) != 1 || *result.Discounts[0].Targets[0].CartLine.Id != "a" {
		t.Fatalf("only included Product should receive discount: %+v", result)
	}
}

func TestCollectionMembershipUsesCurrentIdsInsteadOfSnapshot(t *testing.T) {
	rule := strings.Replace(testRule(`[{"tierId":"two","quantity":2,"discountType":"percentage","discountValue":1000}]`),
		`"kind":"products","productIds":["p1"],"excludedProductIds":[]`,
		`"kind":"collections","collectionIds":["c1"],"resolvedProductIds":["old"],"excludedProductIds":["excluded"]`, 1)
	member := testLine("member", "new", "10.00", "9.00", 2)
	member.Merchandise.ProductVariant.Product.InCollections = []*module.CollectionMembership{{CollectionId: pointer("c1"), IsMember: pointer(true)}}
	old := testLine("old", "old", "10.00", "9.00", 2)
	excluded := testLine("excluded", "excluded", "10.00", "9.00", 2)
	excluded.Merchandise.ProductVariant.Product.InCollections = []*module.CollectionMembership{{CollectionId: pointer("c1"), IsMember: pointer(true)}}
	result := EvaluateDiscounts(testRequest(rule, member, old, excluded))
	if len(result.Discounts) != 1 || len(result.Discounts[0].Targets) != 1 || *result.Discounts[0].Targets[0].CartLine.Id != "member" {
		t.Fatalf("only current non-excluded classification member should be discounted: %+v", result)
	}
}

func TestCollectionMembershipRejectsFalseOrOtherCollection(t *testing.T) {
	rule := strings.Replace(testRule(`[{"tierId":"one","quantity":1,"discountType":"percentage","discountValue":1000}]`),
		`"kind":"products","productIds":["p1"],"excludedProductIds":[]`,
		`"kind":"collections","collectionIds":["c1"],"excludedProductIds":[]`, 1)
	for _, membership := range []*module.CollectionMembership{
		{CollectionId: pointer("c1"), IsMember: pointer(false)},
		{CollectionId: pointer("c2"), IsMember: pointer(true)},
		{CollectionId: pointer("c1")},
	} {
		line := testLine("line", "p1", "10.00", "9.00", 1)
		line.Merchandise.ProductVariant.Product.InCollections = []*module.CollectionMembership{membership}
		if result := EvaluateDiscounts(testRequest(rule, line)); len(result.Discounts) != 0 {
			t.Fatalf("non-matching membership discounted: %+v", result)
		}
	}
}

func TestEmptyCollectionInputReportsMissingVariablesWithoutGrantingDiscount(t *testing.T) {
	rule := strings.Replace(testRule(`[{"tierId":"three","quantity":3,"discountType":"percentage","discountValue":2000}]`),
		`"kind":"products","productIds":["p1"],"excludedProductIds":[]`,
		`"kind":"collections","collectionIds":["12277057487400872661322470"],"excludedProductIds":[]`, 1)
	line := testLine("0_18077057526399511251182470", "16077057526399007934692470", "22", "22", 3)
	var logs []string
	result := EvaluateDiscountsWithTrace(testRequest(rule, line), func(message string) { logs = append(logs, message) })
	if len(result.Discounts) != 0 {
		t.Fatal("missing membership must not grant a collection discount")
	}
	if !strings.Contains(strings.Join(logs, "\n"), "collection membership missing; check Function input variables") {
		t.Fatalf("missing collection input needs an actionable diagnostic: %v", logs)
	}
	line.Merchandise.ProductVariant.Product.InCollections = []*module.CollectionMembership{{CollectionId: pointer("12277057487400872661322470"), IsMember: pointer(true)}}
	result = EvaluateDiscounts(testRequest(rule, line))
	if len(result.Discounts) != 1 || *result.Discounts[0].Targets[0].Value.FixedAmount.Amount != "4.40" {
		t.Fatalf("a current membership must apply 20 percent to the three 22 USD units: %+v", result)
	}
}

func TestOverlappingDiscountNodesExcludeOnlyConflictedProduct(t *testing.T) {
	rule := strings.Replace(testRule(`[{"tierId":"one","quantity":1,"discountType":"percentage","discountValue":1000}]`),
		`"kind":"products","productIds":["p1"],"excludedProductIds":[]`,
		`"kind":"collections","collectionIds":["c1"],"excludedProductIds":[]`, 1)
	shared := testLine("shared", "p1", "10.00", "9.00", 1)
	shared.Merchandise.ProductVariant.Product.InCollections = []*module.CollectionMembership{{CollectionId: pointer("c1"), IsMember: pointer(true)}, {CollectionId: pointer("c2"), IsMember: pointer(true)}}
	unique := testLine("unique", "p2", "10.00", "9.00", 1)
	unique.Merchandise.ProductVariant.Product.InCollections = []*module.CollectionMembership{{CollectionId: pointer("c1"), IsMember: pointer(true)}, {CollectionId: pointer("c2"), IsMember: pointer(false)}}
	request := testRequest(rule, shared, unique)
	second := strings.Replace(rule, `"collectionIds":["c1"]`, `"collectionIds":["c2"]`, 1)
	request.DiscountNodes = append(request.DiscountNodes, &module.DiscountNode{PriceRuleId: pointer("rule-2"), Metafields: []*module.Metafield{{Namespace: pointer("sale"), Key: "quantity_breaks", Type: "json", Value: second}}})
	result := EvaluateDiscounts(request)
	if len(result.Discounts) != 1 || len(result.Discounts[0].Targets) != 1 || *result.Discounts[0].Targets[0].CartLine.Id != "unique" {
		t.Fatalf("conflicted product must not receive any discount: %+v", result)
	}
}

func TestSpecifiedMarketFixedPriceUsesPresentmentVariantPrice(t *testing.T) {
	rule := testRule(`[{"tierId":"two","quantity":2,"discountType":"fixed_price","discountValue":5000,"marketOverrides":{"market-eu":{"mode":"specified_amount","amountMinor":7000,"currencyCode":"EUR","currencyDecimals":2}}}]`)
	result := EvaluateDiscounts(testRequest(rule, testLine("a", "p1", "100.00", "90.00", 1), testLine("b", "p1", "200.00", "120.00", 1)))
	if len(result.Discounts) != 1 || len(result.Discounts[0].Targets) != 2 {
		t.Fatalf("expected two market-price targets: %+v", result)
	}
	for i, want := range []string{"20.00", "50.00"} {
		value := result.Discounts[0].Targets[i].Value
		if value.FixedAmount != nil || value.PresentmentFixedAmount == nil || *value.PresentmentFixedAmount.Amount != want || *value.PresentmentFixedAmount.Currency != "EUR" {
			t.Fatalf("target %d: want EUR %s presentment discount, got %+v", i, want, value)
		}
	}
}

func TestAutoMarketAmountUsesShopCurrencyForPlatformConversion(t *testing.T) {
	rule := testRule(`[{"tierId":"two","quantity":2,"discountType":"fixed_amount","discountValue":1000,"marketOverrides":{"market-eu":{"mode":"auto_convert"}}}]`)
	result := EvaluateDiscounts(testRequest(rule, testLine("a", "p1", "100.00", "90.00", 2)))
	if len(result.Discounts) != 1 || len(result.Discounts[0].Targets) != 1 {
		t.Fatalf("expected shop-money target: %+v", result)
	}
	value := result.Discounts[0].Targets[0].Value
	if value.PresentmentFixedAmount != nil || value.FixedAmount == nil || *value.FixedAmount.Amount != "10.00" {
		t.Fatalf("auto conversion must use shop currency: %+v", value)
	}
}

func TestInvalidPriceAndMarketCurrencyFailClosed(t *testing.T) {
	base := testRule(`[{"tierId":"one","quantity":1,"discountType":"percentage","discountValue":1000}]`)
	for _, price := range []string{"-1.00", "1.001", "NaN", "92233720368547758.08"} {
		result := EvaluateDiscounts(testRequest(base, testLine("a", "p1", price, "90.00", 1)))
		if len(result.Discounts) != 0 {
			t.Fatalf("invalid price %q received discount: %+v", price, result)
		}
	}
	market := testRule(`[{"tierId":"one","quantity":1,"discountType":"fixed_amount","discountValue":1000,"marketOverrides":{"market-eu":{"mode":"specified_amount","amountMinor":700,"currencyCode":"EUR","currencyDecimals":2}}}]`)
	line := testLine("a", "p1", "100.00", "90.00", 1)
	line.Merchandise.ProductVariant.PriceSet.PresentmentMoney.CurrencyCode = "GBP"
	if result := EvaluateDiscounts(testRequest(market, line)); len(result.Discounts) != 0 {
		t.Fatalf("market currency mismatch received discount: %+v", result)
	}
}

func TestMissingPriceSetDoesNotSuppressOtherProductDiscount(t *testing.T) {
	rule := strings.Replace(testRule(`[{"tierId":"two","quantity":2,"discountType":"percentage","discountValue":1000}]`),
		`"kind":"products","productIds":["p1"],"excludedProductIds":[]`,
		`"kind":"all","productIds":[],"excludedProductIds":[]`, 1)
	valid := testLine("priced", "p1", "100.00", "90.00", 2)
	missing := testLine("missing-price", "p2", "0.00", "0.00", 2)
	missing.Merchandise.ProductVariant.PriceSet = nil
	result := EvaluateDiscounts(testRequest(rule, valid, missing))
	if len(result.Discounts) != 1 || len(result.Discounts[0].Targets) != 1 {
		t.Fatalf("expected the priced product to remain discounted: %+v", result)
	}
	if got := *result.Discounts[0].Targets[0].CartLine.Id; got != "priced" {
		t.Fatalf("unexpected target %s", got)
	}
}
