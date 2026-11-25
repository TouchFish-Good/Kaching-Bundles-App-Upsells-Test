package discount

import (
	"math"
	"strconv"
	"strings"

	"github.com/mailru/easyjson"
	"github.com/shoplinedev/function-extensions-template/templates/product-discount-customizations/module"
)

type ruleScope struct {
	Kind               string   `json:"kind"`
	ProductIDs         []string `json:"productIds"`
	CollectionIDs      []string `json:"collectionIds"`
	ResolvedProductIDs []string `json:"resolvedProductIds"`
	ExcludedProductIDs []string `json:"excludedProductIds"`
}

type marketOverride struct {
	Mode             string `json:"mode"`
	AmountMinor      *int64 `json:"amountMinor"`
	CurrencyCode     string `json:"currencyCode"`
	CurrencyDecimals *int   `json:"currencyDecimals"`
}

type discountTier struct {
	TierID          string                    `json:"tierId"`
	Quantity        int64                     `json:"quantity"`
	DiscountType    string                    `json:"discountType"`
	DiscountValue   *int64                    `json:"discountValue"`
	MarketOverrides map[string]marketOverride `json:"marketOverrides"`
}

type discountRule struct {
	SchemaVersion         int            `json:"schemaVersion"`
	CampaignID            string         `json:"campaignId"`
	StoreCurrencyCode     string         `json:"storeCurrencyCode"`
	StoreCurrencyDecimals int            `json:"storeCurrencyDecimals"`
	Scope                 ruleScope      `json:"scope"`
	Tiers                 []discountTier `json:"tiers"`
}

type candidate struct {
	discounts []*module.ProductDiscount
}

type outputBucketKey struct {
	mode     string
	currency string
	decimals int
	perItem  bool
}

type productRuleMatch struct {
	priority int
	count    int
}

func EvaluateDiscounts(req *module.ProductDiscountCustomizationFunctionRequest) module.ProductDiscountCustomizationFunctionResponse {
	return evaluateDiscounts(req, func(string) {})
}

// EvaluateDiscountsWithTrace emits progress messages without coupling the
// evaluator to the WASM runtime, so normal Go tests remain executable.
func EvaluateDiscountsWithTrace(req *module.ProductDiscountCustomizationFunctionRequest, trace func(string)) module.ProductDiscountCustomizationFunctionResponse {
	if trace == nil {
		trace = func(string) {}
	}
	return evaluateDiscounts(req, trace)
}

func evaluateDiscounts(req *module.ProductDiscountCustomizationFunctionRequest, trace func(string)) module.ProductDiscountCustomizationFunctionResponse {
	result := module.ProductDiscountCustomizationFunctionResponse{Discounts: []*module.ProductDiscount{}}
	trace("quantity-breaks: evaluate start")
	if req == nil || req.Cart == nil || len(req.DiscountNodes) == 0 {
		trace("quantity-breaks: evaluate empty input")
		return result
	}
	var candidates []candidate
	validNodes := make([]struct {
		node *module.DiscountNode
		rule discountRule
	}, 0, len(req.DiscountNodes))
	for _, node := range req.DiscountNodes {
		trace("quantity-breaks: evaluate parse node")
		if node == nil || node.PriceRuleId == nil || *node.PriceRuleId == "" {
			continue
		}
		rule, ok := ruleFromNode(node)
		if !ok {
			trace("quantity-breaks: evaluate skipped invalid rule")
			continue
		}
		validNodes = append(validNodes, struct {
			node *module.DiscountNode
			rule discountRule
		}{node, rule})
	}
	trace("quantity-breaks: evaluate parsed nodes")
	productMatches := map[string]productRuleMatch{}
	missingMembershipReported := false
	for _, entry := range validNodes {
		seen := map[string]bool{}
		for _, line := range req.Cart.Lines {
			if line == nil || line.Merchandise == nil || line.Merchandise.ProductVariant == nil || line.Merchandise.ProductVariant.Product == nil || line.Merchandise.ProductVariant.Product.Id == nil {
				continue
			}
			product := line.Merchandise.ProductVariant.Product
			id := *product.Id
			if entry.rule.Scope.Kind == "collections" && len(product.InCollections) == 0 && !missingMembershipReported {
				trace("quantity-breaks: collection membership missing; check Function input variables")
				missingMembershipReported = true
			}
			if !seen[id] && appliesToProduct(entry.rule.Scope, id, product.InCollections) {
				seen[id] = true
				priority := scopePriority(entry.rule.Scope)
				match := productMatches[id]
				if priority > match.priority {
					productMatches[id] = productRuleMatch{priority: priority, count: 1}
				} else if priority == match.priority && priority != 1 {
					match.count++
					productMatches[id] = match
				}
			}
		}
	}
	trace("quantity-breaks: evaluate matched products")
	for _, entry := range validNodes {
		trace("quantity-breaks: evaluate apply rule")
		candidate, valid := applyRule(entry.rule, entry.node, req, productMatches)
		if !valid {
			trace("quantity-breaks: evaluate invalid candidate")
			return result
		}
		if len(candidate.discounts) > 0 {
			candidates = append(candidates, candidate)
		}
	}
	trace("quantity-breaks: evaluate collected candidates")
	for _, entry := range candidates {
		result.Discounts = append(result.Discounts, entry.discounts...)
	}
	trace("quantity-breaks: evaluate complete")
	return result
}

func ruleFromNode(node *module.DiscountNode) (discountRule, bool) {
	for _, field := range node.Metafields {
		if field == nil || field.Namespace == nil || *field.Namespace != "sale" || field.Key != "quantity_breaks" {
			continue
		}
		var rule discountRule
		if easyjson.Unmarshal([]byte(field.Value), &rule) != nil || !validRule(rule) {
			return discountRule{}, false
		}
		return rule, true
	}
	return discountRule{}, false
}

func validRule(rule discountRule) bool {
	if rule.SchemaVersion != 1 || rule.CampaignID == "" || len(rule.Tiers) == 0 || len(rule.StoreCurrencyCode) != 3 || rule.StoreCurrencyDecimals < 0 || rule.StoreCurrencyDecimals > 3 {
		return false
	}
	if rule.Scope.Kind != "all" && rule.Scope.Kind != "products" && rule.Scope.Kind != "collections" {
		return false
	}
	if rule.Scope.Kind == "products" && len(rule.Scope.ProductIDs) == 0 || rule.Scope.Kind == "collections" && len(rule.Scope.CollectionIDs) == 0 {
		return false
	}
	seen := map[int64]bool{}
	for _, tier := range rule.Tiers {
		if tier.TierID == "" || tier.Quantity < 1 || seen[tier.Quantity] {
			return false
		}
		seen[tier.Quantity] = true
		switch tier.DiscountType {
		case "none":
			if tier.DiscountValue != nil {
				return false
			}
		case "percentage":
			if tier.DiscountValue == nil || *tier.DiscountValue < 0 || *tier.DiscountValue > 10000 {
				return false
			}
		case "fixed_amount", "fixed_price", "bundle_fixed_amount", "bundle_fixed_price":
			if tier.DiscountValue == nil || *tier.DiscountValue < 0 {
				return false
			}
		default:
			return false
		}
		for _, override := range tier.MarketOverrides {
			if override.Mode != "auto_convert" && override.Mode != "specified_amount" {
				return false
			}
			if override.Mode == "specified_amount" && (tier.DiscountType != "fixed_amount" && tier.DiscountType != "fixed_price" && tier.DiscountType != "bundle_fixed_amount" && tier.DiscountType != "bundle_fixed_price" || override.AmountMinor == nil || *override.AmountMinor < 0 || len(override.CurrencyCode) != 3 || override.CurrencyDecimals == nil || *override.CurrencyDecimals < 0 || *override.CurrencyDecimals > 3) {
				return false
			}
		}
	}
	return true
}

func appliesToProduct(scope ruleScope, productID string, memberships []*module.CollectionMembership) bool {
	if productID == "" {
		return false
	}
	for _, excluded := range scope.ExcludedProductIDs {
		if excluded == productID {
			return false
		}
	}
	if scope.Kind == "all" {
		return true
	}
	if scope.Kind == "collections" {
		for _, membership := range memberships {
			if membership == nil || membership.CollectionId == nil || membership.IsMember == nil || !*membership.IsMember {
				continue
			}
			for _, id := range scope.CollectionIDs {
				if id == *membership.CollectionId {
					return true
				}
			}
		}
		return false
	}
	for _, id := range scope.ProductIDs {
		if id == productID {
			return true
		}
	}
	return false
}

func scopePriority(scope ruleScope) int {
	if scope.Kind == "products" {
		return 2
	}
	if scope.Kind == "collections" {
		return 1
	}
	return 0
}

func applyRule(rule discountRule, node *module.DiscountNode, req *module.ProductDiscountCustomizationFunctionRequest, productMatches map[string]productRuleMatch) (candidate, bool) {
	groups := map[string][]*module.CartLineInput{}
	quantities := map[string]int64{}
	for _, line := range req.Cart.Lines {
		if line == nil || line.Id == nil || line.Quantity == nil || *line.Quantity <= 0 || line.Merchandise == nil || line.Merchandise.ProductVariant == nil || line.Merchandise.ProductVariant.Product == nil || line.Merchandise.ProductVariant.Product.Id == nil {
			continue
		}
		id := *line.Merchandise.ProductVariant.Product.Id
		match := productMatches[id]
		if match.count != 1 || match.priority != scopePriority(rule.Scope) || !appliesToProduct(rule.Scope, id, line.Merchandise.ProductVariant.Product.InCollections) {
			continue
		}
		if quantities[id] > math.MaxInt64-*line.Quantity {
			return candidate{}, false
		}
		quantities[id] += *line.Quantity
		groups[id] = append(groups[id], line)
	}
	perItemTargets := map[outputBucketKey][]*module.ProductDiscountTarget{}
	discounts := []*module.ProductDiscount{}
	marketID := ""
	if req.Localization != nil && req.Localization.MarketId != nil {
		marketID = *req.Localization.MarketId
	}
	for productID, lines := range groups {
		var selected *discountTier
		for index := range rule.Tiers {
			tier := &rule.Tiers[index]
			if tier.Quantity <= quantities[productID] && (selected == nil || tier.Quantity > selected.Quantity) {
				selected = tier
			}
		}
		if selected == nil || selected.DiscountType == "none" {
			continue
		}
		override := selected.MarketOverrides[marketID]
		currentMode := "shop"
		if override.Mode == "specified_amount" {
			currentMode = "presentment"
		}
		decimals := rule.StoreCurrencyDecimals
		currency := rule.StoreCurrencyCode
		amount := selected.DiscountValue
		if currentMode == "presentment" {
			decimals = *override.CurrencyDecimals
			currency = override.CurrencyCode
			amount = override.AmountMinor
		}
		groupTargets := []*module.ProductDiscountTarget{}
		groupSubtotal := int64(0)
		bundleDiscount := selected.DiscountType == "bundle_fixed_amount" || selected.DiscountType == "bundle_fixed_price"
		for _, line := range lines {
			variant := line.Merchandise.ProductVariant
			if variant.PriceSet == nil {
				if bundleDiscount {
					return candidate{}, false
				}
				continue
			}
			price := variant.PriceSet.ShopMoney
			if currentMode == "presentment" {
				price = variant.PriceSet.PresentmentMoney
			}
			if price == nil || price.CurrencyCode != currency {
				return candidate{}, false
			}
			priceMinor, ok := parseMinor(price.Amount, decimals)
			if !ok {
				return candidate{}, false
			}
			if priceMinor > math.MaxInt64 / *line.Quantity {
				return candidate{}, false
			}
			lineSubtotal := priceMinor * *line.Quantity
			if groupSubtotal > math.MaxInt64-lineSubtotal {
				return candidate{}, false
			}
			groupSubtotal += lineSubtotal
			if bundleDiscount {
				groupTargets = append(groupTargets, &module.ProductDiscountTarget{CartLine: &module.CartLineTarget{Id: line.Id, Quantity: line.Quantity}})
				continue
			}
			discountMinor := int64(0)
			switch selected.DiscountType {
			case "percentage":
				discountMinor = (priceMinor/10000)*(*amount) + ((priceMinor%10000)*(*amount)+5000)/10000
			case "fixed_amount":
				discountMinor = *amount
			case "fixed_price":
				discountMinor = priceMinor - *amount
			}
			if discountMinor > priceMinor {
				discountMinor = priceMinor
			}
			if discountMinor <= 0 {
				continue
			}
			formatted := formatMinor(discountMinor, decimals)
			perItem := true
			value := &module.ProductDiscountValue{}
			if currentMode == "presentment" {
				value.PresentmentFixedAmount = &module.PresentmentFixedAmount{Amount: &formatted, Currency: &currency, AppliesToEachItem: &perItem}
			} else {
				value.FixedAmount = &module.ProductDiscountFixedAmount{Amount: &formatted, AppliesToEachItem: &perItem}
			}
			key := outputBucketKey{mode: currentMode, currency: currency, decimals: decimals, perItem: perItem}
			perItemTargets[key] = append(perItemTargets[key], &module.ProductDiscountTarget{CartLine: &module.CartLineTarget{Id: line.Id, Quantity: line.Quantity}, Value: value})
		}
		if bundleDiscount {
			if len(groupTargets) == 0 {
				continue
			}
			discountMinor := *amount
			if selected.DiscountType == "bundle_fixed_price" {
				discountMinor = groupSubtotal - *amount
			}
			if discountMinor > groupSubtotal {
				discountMinor = groupSubtotal
			}
			if discountMinor <= 0 {
				continue
			}
			formatted := formatMinor(discountMinor, decimals)
			perItem := false
			value := &module.ProductDiscountValue{}
			if currentMode == "presentment" {
				value.PresentmentFixedAmount = &module.PresentmentFixedAmount{Amount: &formatted, Currency: &currency, AppliesToEachItem: &perItem}
			} else {
				value.FixedAmount = &module.ProductDiscountFixedAmount{Amount: &formatted, AppliesToEachItem: &perItem}
			}
			discounts = append(discounts, &module.ProductDiscount{PriceRuleId: node.PriceRuleId, Targets: groupTargets, Value: value})
		}
	}
	for _, targets := range perItemTargets {
		if len(targets) > 0 {
			discounts = append(discounts, &module.ProductDiscount{PriceRuleId: node.PriceRuleId, Targets: targets})
		}
	}
	if len(discounts) == 0 {
		return candidate{}, true
	}
	return candidate{discounts: discounts}, true
}

func parseMinor(amount string, decimals int) (int64, bool) {
	if decimals < 0 || decimals > 3 || amount == "" || strings.HasPrefix(amount, "-") {
		return 0, false
	}
	parts := strings.Split(amount, ".")
	if len(parts) > 2 || len(parts[0]) == 0 {
		return 0, false
	}
	whole, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || whole < 0 {
		return 0, false
	}
	frac := ""
	if len(parts) == 2 {
		frac = parts[1]
	}
	if len(frac) > decimals || len(parts) == 2 && len(frac) == 0 {
		return 0, false
	}
	for len(frac) < decimals {
		frac += "0"
	}
	scale := int64(1)
	for i := 0; i < decimals; i++ {
		scale *= 10
	}
	if whole > math.MaxInt64/scale {
		return 0, false
	}
	fraction := int64(0)
	if frac != "" {
		fraction, err = strconv.ParseInt(frac, 10, 64)
		if err != nil {
			return 0, false
		}
	}
	if whole*scale > math.MaxInt64-fraction {
		return 0, false
	}
	return whole*scale + fraction, true
}

func formatMinor(amount int64, decimals int) string {
	if decimals == 0 {
		return strconv.FormatInt(amount, 10)
	}
	scale := int64(1)
	for i := 0; i < decimals; i++ {
		scale *= 10
	}
	fraction := strconv.FormatInt(amount%scale, 10)
	for len(fraction) < decimals {
		fraction = "0" + fraction
	}
	return strconv.FormatInt(amount/scale, 10) + "." + fraction
}
