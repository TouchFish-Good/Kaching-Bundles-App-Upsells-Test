package discount

import (
	"math"
	"sort"
	"strings"

	"github.com/mailru/easyjson"
	"github.com/mailru/easyjson/jlexer"
	"github.com/shoplinedev/function-extensions-template/templates/product-discount-customizations/module"
)

const maxSafeInteger int64 = 9007199254740991

// Detect duplicate JSON keys recursively before accepting v2. Legacy decoding is
// untouched. Depth and size bounds also bound untrusted metafield processing.
func uniqueJSON(data []byte, depth int) bool {
	if depth > 24 || len(data) > 262144 {
		return false
	}
	in := jlexer.Lexer{Data: data}
	if in.IsDelim('{') {
		in.Delim('{')
		seen := map[string]bool{}
		for !in.IsDelim('}') && in.Error() == nil {
			key := in.String()
			in.WantColon()
			if seen[key] {
				return false
			}
			seen[key] = true
			if !uniqueJSON(in.Raw(), depth+1) {
				return false
			}
			in.WantComma()
		}
		in.Delim('}')
	} else if in.IsDelim('[') {
		in.Delim('[')
		for !in.IsDelim(']') && in.Error() == nil {
			if !uniqueJSON(in.Raw(), depth+1) {
				return false
			}
			in.WantComma()
		}
		in.Delim(']')
	} else {
		in.SkipRecursive()
	}
	in.Consumed()
	return in.Error() == nil
}
func safeID(s string) bool { return s != "" && strings.TrimSpace(s) == s }
func validCurrency(s string) bool {
	if len(s) != 3 {
		return false
	}
	for _, c := range s {
		if c < 'A' || c > 'Z' {
			return false
		}
	}
	return true
}
func validOffers(r discountRule) bool {
	if !r.hasCurrencyDecimals || !validCurrency(r.StoreCurrencyCode) {
		return false
	}
	tierIDs := map[string]bool{}
	for _, t := range r.Tiers {
		if tierIDs[t.TierID] || t.Quantity > maxSafeInteger || t.DiscountValue != nil && *t.DiscountValue > maxSafeInteger {
			return false
		}
		tierIDs[t.TierID] = true
	}
	seen := map[string]bool{}
	for kind, m := range map[string]*offerModule{"gift": r.Gifts, "bundle": r.Bundles} {
		if m == nil {
			continue
		}
		if m.Version != 1 || m.Enabled == nil {
			return false
		}
		if !*m.Enabled {
			continue
		}
		if m.QuantityMode != "fixed" || m.QuotaScope != "main_product" || len(m.Items) == 0 {
			return false
		}
		if kind == "gift" && m.SelectionMode != "all_eligible" || kind == "bundle" && m.SelectionMode != "multiple" && m.SelectionMode != "single" {
			return false
		}
		for _, item := range m.Items {
			if !safeID(item.RuleID) || seen[item.RuleID] || !safeID(item.ProductID) || item.DisplayOrder == nil || *item.DisplayOrder < 0 || *item.DisplayOrder > maxSafeInteger || item.Quantity < 1 || item.Quantity > maxSafeInteger || len(item.AllowedVariantIDs) == 0 || item.DiscountValue == nil || *item.DiscountValue < 0 || *item.DiscountValue > maxSafeInteger {
				return false
			}
			seen[item.RuleID] = true
			variants := map[string]bool{}
			for _, v := range item.AllowedVariantIDs {
				if !safeID(v) || variants[v] {
					return false
				}
				variants[v] = true
			}
			if item.DiscountType != "fixed_price" && item.DiscountType != "fixed_amount" && item.DiscountType != "percentage" || item.DiscountType == "percentage" && *item.DiscountValue > 10000 || kind == "gift" && (item.DiscountType != "fixed_price" || *item.DiscountValue != 0) {
				return false
			}
			tr := item.Trigger
			if tr.Type == "quantity" {
				if tr.Quantity < 1 || tr.Quantity > maxSafeInteger || tr.Operator != "gt" && tr.Operator != "gte" && tr.Operator != "eq" || len(tr.TierIDs) != 0 {
					return false
				}
			} else if tr.Type == "tiers" {
				if len(tr.TierIDs) == 0 || tr.Operator != "" || tr.Quantity != 0 {
					return false
				}
				seenTiers := map[string]bool{}
				for _, id := range tr.TierIDs {
					if !tierIDs[id] || seenTiers[id] {
						return false
					}
					seenTiers[id] = true
				}
			} else {
				return false
			}
			for market, o := range item.MarketOverrides {
				if !safeID(market) || o.Mode != "specified_amount" && o.Mode != "auto_convert" {
					return false
				}
				if o.Mode == "specified_amount" && (item.DiscountType == "percentage" || o.AmountMinor == nil || *o.AmountMinor < 0 || *o.AmountMinor > maxSafeInteger || !validCurrency(o.CurrencyCode) || o.CurrencyDecimals == nil || *o.CurrencyDecimals < 0 || *o.CurrencyDecimals > 3 || kind == "gift" && *o.AmountMinor != 0) {
					return false
				}
			}
		}
	}
	return true
}

type lineProtocol struct {
	values              map[string]string
	marked, valid, main bool
}

func protocol(line *module.CartLineInput) lineProtocol {
	p := lineProtocol{values: map[string]string{}, valid: true}
	if line == nil {
		p.valid = false
		return p
	}
	for _, property := range line.Properties {
		if property == nil || property.Name == nil {
			continue
		}
		name := *property.Name
		if !strings.HasPrefix(name, "_qb_") {
			continue
		}
		p.marked = true
		if _, exists := p.values[name]; exists || property.Value == nil {
			p.valid = false
			continue
		}
		p.values[name] = *property.Value
	}
	if !p.marked {
		p.main = true
		return p
	}
	p.valid = p.valid && p.values["_qb_protocol"] == "gift-bundles-v1" && safeID(p.values["_qb_campaign"]) && safeID(p.values["_qb_context"]) && safeID(p.values["_qb_source_product"])
	p.main = p.valid && p.values["_qb_role"] == "main" && p.values["_qb_rule"] == ""
	return p
}
func actualProduct(l *module.CartLineInput) string {
	if l == nil || l.Merchandise == nil || l.Merchandise.ProductVariant == nil || l.Merchandise.ProductVariant.Product == nil || l.Merchandise.ProductVariant.Product.Id == nil {
		return ""
	}
	return *l.Merchandise.ProductVariant.Product.Id
}
func enabled(m *offerModule) bool { return m != nil && m.Enabled != nil && *m.Enabled }
func accessoryProducts(nodes []ruleNode) map[string]bool {
	ids := map[string]bool{}
	for _, e := range nodes {
		if e.rule.SchemaVersion != 2 {
			continue
		}
		for _, m := range []*offerModule{e.rule.Gifts, e.rule.Bundles} {
			if enabled(m) {
				for _, item := range m.Items {
					ids[item.ProductID] = true
				}
			}
		}
	}
	return ids
}

// In a mixed protocol cart legacy rules must not see accessory units either.
func mainRequest(req *module.ProductDiscountCustomizationFunctionRequest, nodes []ruleNode) *module.ProductDiscountCustomizationFunctionRequest {
	hasV2 := false
	for _, e := range nodes {
		hasV2 = hasV2 || e.rule.SchemaVersion == 2
	}
	if !hasV2 {
		// Invalid v2 metadata is still a protocol boundary for legacy main counting.
		for _, node := range req.DiscountNodes {
			if node == nil {
				continue
			}
			for _, field := range node.Metafields {
				if field == nil || field.Namespace == nil || *field.Namespace != "sale" || field.Key != "quantity_breaks" {
					continue
				}
				var raw discountRule
				if easyjson.Unmarshal([]byte(field.Value), &raw) == nil && raw.SchemaVersion == 2 {
					hasV2 = true
				}
			}
		}
	}
	if !hasV2 {
		return req
	}
	copyReq := *req
	copyCart := *req.Cart
	copyCart.Lines = nil
	excluded := accessoryProducts(nodes)
	for _, line := range req.Cart.Lines {
		p := protocol(line)
		if p.main && !excluded[actualProduct(line)] {
			copyCart.Lines = append(copyCart.Lines, line)
		}
	}
	copyReq.Cart = &copyCart
	return &copyReq
}

type offerMoney struct {
	mode, currency string
	decimals       int
	amount         int64
}

func moneyFor(r discountRule, value *int64, overrides map[string]marketOverride, market string) offerMoney {
	m := offerMoney{mode: "shop", currency: r.StoreCurrencyCode, decimals: r.StoreCurrencyDecimals}
	if value != nil {
		m.amount = *value
	}
	if o := overrides[market]; o.Mode == "specified_amount" {
		m.mode = "presentment"
		m.currency = o.CurrencyCode
		m.decimals = *o.CurrencyDecimals
		m.amount = *o.AmountMinor
	}
	return m
}
func priceFor(l *module.CartLineInput, m offerMoney) (int64, bool) {
	if l == nil || l.Merchandise == nil || l.Merchandise.ProductVariant == nil || l.Merchandise.ProductVariant.PriceSet == nil {
		return 0, false
	}
	prices := l.Merchandise.ProductVariant.PriceSet
	p := prices.ShopMoney
	if m.mode == "presentment" {
		p = prices.PresentmentMoney
	}
	if p == nil || p.CurrencyCode != m.currency {
		return 0, false
	}
	// parseMinor preserves the v1 contract; v2 accepts decimal digits only.
	for _, c := range p.Amount {
		if c != '.' && (c < '0' || c > '9') {
			return 0, false
		}
	}
	return parseMinor(p.Amount, m.decimals)
}
func reduction(price, amount int64, typ string, accessory bool) int64 {
	d := amount
	switch typ {
	case "percentage":
		rate := amount
		if accessory {
			rate = 10000 - amount
		}
		d = (price/10000)*rate + ((price%10000)*rate+5000)/10000
		if accessory {
			d = price - d
		}
	case "fixed_price":
		d = price - amount
	}
	if d < 0 {
		return 0
	}
	if d > price {
		return price
	}
	return d
}
func multiply(a, b int64) (int64, bool) {
	if a < 0 || b < 0 || b != 0 && a > math.MaxInt64/b {
		return 0, false
	}
	return a * b, true
}
func lineTotal(l *module.CartLineInput, qty, amount int64, m offerMoney) *module.ProductDiscountTarget {
	text := formatMinor(amount, m.decimals)
	each := false
	q := qty
	value := &module.ProductDiscountValue{}
	if m.mode == "shop" {
		value.FixedAmount = &module.ProductDiscountFixedAmount{Amount: &text, AppliesToEachItem: &each}
	} else {
		currency := m.currency
		value.PresentmentFixedAmount = &module.PresentmentFixedAmount{Amount: &text, Currency: &currency, AppliesToEachItem: &each}
	}
	return &module.ProductDiscountTarget{CartLine: &module.CartLineTarget{Id: l.Id, Quantity: &q}, Value: value}
}
func eligible(item offerRule, tiers []discountTier, qty int64) bool {
	if item.Trigger.Type == "quantity" {
		switch item.Trigger.Operator {
		case "gt":
			return qty > item.Trigger.Quantity
		case "gte":
			return qty >= item.Trigger.Quantity
		case "eq":
			return qty == item.Trigger.Quantity
		}
	}
	var selected *discountTier
	for i := range tiers {
		t := &tiers[i]
		if t.Quantity <= qty && (selected == nil || t.Quantity > selected.Quantity) {
			selected = t
		}
	}
	if selected != nil {
		for _, id := range item.Trigger.TierIDs {
			if id == selected.TierID {
				return true
			}
		}
	}
	return false
}
func ownsProduct(nodes []ruleNode, owner int, l *module.CartLineInput) bool {
	id := actualProduct(l)
	if id == "" {
		return false
	}
	priority := -1
	count := 0
	index := -1
	for i, e := range nodes {
		if !appliesToProduct(e.rule.Scope, id, l.Merchandise.ProductVariant.Product.InCollections) {
			continue
		}
		p := scopePriority(e.rule.Scope)
		if p > priority {
			priority = p
			count = 1
			index = i
		} else if p == priority {
			count++
		}
	}
	return count == 1 && index == owner
}

type offerAllocation struct {
	targets []*module.ProductDiscountTarget
	money   offerMoney
	total   int64
}

func evaluateOffersV2(req *module.ProductDiscountCustomizationFunctionRequest, nodes []ruleNode) []candidate {
	excluded := accessoryProducts(nodes)
	lines := append([]*module.CartLineInput(nil), req.Cart.Lines...)
	sort.SliceStable(lines, func(i, j int) bool {
		a, b := "", ""
		if lines[i] != nil && lines[i].Id != nil {
			a = *lines[i].Id
		}
		if lines[j] != nil && lines[j].Id != nil {
			b = *lines[j].Id
		}
		return a < b
	})
	// Duplicate cart IDs cannot be allocated safely, including across main/accessory.
	ids := map[string]int{}
	for _, l := range lines {
		if l != nil && l.Id != nil {
			ids[*l.Id]++
		}
	}
	market := ""
	if req.Localization != nil && req.Localization.MarketId != nil {
		market = *req.Localization.MarketId
	}
	var out []candidate
	used := map[string]bool{}
	for index, e := range nodes {
		r := e.rule
		if r.SchemaVersion != 2 {
			continue
		}
		groups := map[string][]*module.CartLineInput{}
		quantities := map[string]int64{}
		invalid := false
		for _, l := range lines {
			id := actualProduct(l)
			p := protocol(l)
			if id == "" || excluded[id] || !p.main || !ownsProduct(nodes, index, l) {
				continue
			}
			if p.marked && (p.values["_qb_campaign"] != r.CampaignID || p.values["_qb_source_product"] != id) {
				continue
			}
			if l.Id == nil || *l.Id == "" || ids[*l.Id] != 1 || l.Quantity == nil || *l.Quantity <= 0 || *l.Quantity > maxSafeInteger || quantities[id] > maxSafeInteger-*l.Quantity {
				invalid = true
				break
			}
			quantities[id] += *l.Quantity
			groups[id] = append(groups[id], l)
		}
		if invalid {
			continue
		}
		var allocations []offerAllocation
		for _, id := range sortedKeys(groups) {
			qty := quantities[id]
			var selected *discountTier
			for i := range r.Tiers {
				t := &r.Tiers[i]
				if t.Quantity <= qty && (selected == nil || t.Quantity > selected.Quantity) {
					selected = t
				}
			}
			if selected == nil || selected.DiscountType == "none" {
				continue
			}
			money := moneyFor(r, selected.DiscountValue, selected.MarketOverrides, market)
			group := offerAllocation{money: money}
			subtotal := int64(0)
			bundle := selected.DiscountType == "bundle_fixed_amount" || selected.DiscountType == "bundle_fixed_price"
			for _, l := range groups[id] {
				price, ok := priceFor(l, money)
				if !ok {
					invalid = true
					break
				}
				total, ok := multiply(price, *l.Quantity)
				if !ok || subtotal > math.MaxInt64-total {
					invalid = true
					break
				}
				subtotal += total
				if !bundle {
					d, ok := multiply(reduction(price, money.amount, selected.DiscountType, false), *l.Quantity)
					if !ok {
						invalid = true
						break
					}
					if d > 0 {
						group.targets = append(group.targets, lineTotal(l, *l.Quantity, d, money))
					}
				}
			}
			if invalid {
				break
			}
			if bundle {
				remaining := money.amount
				if selected.DiscountType == "bundle_fixed_price" {
					remaining = subtotal - money.amount
				}
				if remaining > subtotal {
					remaining = subtotal
				}
				// Deterministic line-order allocation, capped by each line's subtotal.
				for _, l := range groups[id] {
					if remaining <= 0 {
						break
					}
					price, _ := priceFor(l, money)
					total, _ := multiply(price, *l.Quantity)
					d := remaining
					if d > total {
						d = total
					}
					if d > 0 {
						group.targets = append(group.targets, lineTotal(l, *l.Quantity, d, money))
						remaining -= d
					}
				}
			}
			if len(group.targets) > 0 {
				allocations = append(allocations, group)
			}
		}
		if invalid {
			continue
		}
		for _, m := range []*offerModule{r.Gifts, r.Bundles} {
			if !enabled(m) {
				continue
			}
			items := append([]offerRule(nil), m.Items...)
			sort.Slice(items, func(i, j int) bool {
				if *items[i].DisplayOrder != *items[j].DisplayOrder {
					return *items[i].DisplayOrder < *items[j].DisplayOrder
				}
				return items[i].RuleID < items[j].RuleID
			})
			for _, source := range sortedKeys(groups) {
				var options []offerAllocation
				for _, item := range items {
					if !eligible(item, r.Tiers, quantities[source]) {
						continue
					}
					role := "bundle"
					if m == r.Gifts {
						role = "gift"
					}
					money := moneyFor(r, item.DiscountValue, item.MarketOverrides, market)
					a := offerAllocation{money: money}
					remaining := item.Quantity
					for _, l := range lines {
						if remaining == 0 {
							break
						}
						p := protocol(l)
						if !p.valid || p.main || p.values["_qb_role"] != role || p.values["_qb_campaign"] != r.CampaignID || p.values["_qb_rule"] != item.RuleID || p.values["_qb_source_product"] != source || actualProduct(l) != item.ProductID || l.Id == nil || *l.Id == "" || ids[*l.Id] != 1 || used[*l.Id] || l.Quantity == nil || *l.Quantity <= 0 || *l.Quantity > maxSafeInteger {
							continue
						}
						sku := l.Merchandise.ProductVariant.Sku
						allowed := false
						if sku != nil {
							for _, v := range item.AllowedVariantIDs {
								allowed = allowed || v == *sku
							}
						}
						if !allowed {
							continue
						}
						price, ok := priceFor(l, money)
						if !ok {
							continue
						}
						q := *l.Quantity
						if q > remaining {
							q = remaining
						}
						d, ok := multiply(reduction(price, money.amount, item.DiscountType, true), q)
						if !ok || a.total > math.MaxInt64-d {
							continue
						}
						remaining -= q
						if d == 0 {
							continue
						}
						a.total += d
						a.targets = append(a.targets, lineTotal(l, q, d, money))
					}
					if len(a.targets) > 0 {
						options = append(options, a)
					}
				}
				if !sameAllocationMoney(options) {
					invalid = true
					break
				}
				if m.SelectionMode == "single" && len(options) > 1 {
					best := 0
					for i := 1; i < len(options); i++ {
						if options[i].total > options[best].total {
							best = i
						}
					}
					options = []offerAllocation{options[best]}
				}
				for _, a := range options {
					for _, t := range a.targets {
						used[*t.CartLine.Id] = true
					}
					allocations = append(allocations, a)
				}
			}
		}
		if invalid {
			continue
		}
		// A node cannot mix output money modes, currencies or precision. Conversion
		// authority belongs to SHOPLINE; no rate is invented here.
		if !sameAllocationMoney(allocations) {
			continue
		}
		targets := []*module.ProductDiscountTarget{}
		for _, a := range allocations {
			targets = append(targets, a.targets...)
		}
		if len(targets) > 0 {
			out = append(out, candidate{discounts: []*module.ProductDiscount{{PriceRuleId: e.node.PriceRuleId, Targets: targets}}})
		}
	}
	return out
}
func sortedKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func moneyKey(m offerMoney) string {
	return m.mode + ":" + m.currency + ":" + string(rune('0'+m.decimals))
}
func sameAllocationMoney(allocations []offerAllocation) bool {
	key := ""
	for _, a := range allocations {
		k := moneyKey(a.money)
		if key != "" && k != key {
			return false
		}
		key = k
	}
	return true
}

// Legacy candidates retain their original independent outputs. V2 candidates
// may join only a single compatible output currency mode.
func compatibleV2(legacy, modern []candidate) []candidate {
	mode := ""
	all := append(append([]candidate(nil), legacy...), modern...)
	for _, c := range all {
		for _, d := range c.discounts {
			for _, t := range d.Targets {
				v := t.Value
				if v == nil {
					v = d.Value
				}
				if v == nil {
					continue
				}
				key := ""
				if v.FixedAmount != nil {
					key = "shop"
				} else if v.PresentmentFixedAmount != nil && v.PresentmentFixedAmount.Currency != nil {
					key = "presentment:" + *v.PresentmentFixedAmount.Currency
				}
				if key == "" || mode != "" && key != mode {
					return nil
				}
				mode = key
			}
		}
	}
	return modern
}
