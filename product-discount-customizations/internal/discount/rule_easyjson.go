package discount

import "github.com/mailru/easyjson/jlexer"

// These decoders deliberately avoid encoding/json reflection. The Function
// runtime is TinyGo/WASM, where reflection-based decoding of a production
// rule metafield can exhaust the runtime before the function returns.
func (v *discountRule) UnmarshalEasyJSON(in *jlexer.Lexer) {
	isTopLevel := in.IsStart()
	if in.IsNull() {
		if isTopLevel {
			in.Consumed()
		}
		in.Skip()
		return
	}
	in.Delim('{')
	for !in.IsDelim('}') {
		key := in.UnsafeFieldName(false)
		in.WantColon()
		if in.IsNull() {
			in.Skip()
			in.WantComma()
			continue
		}
		switch key {
		case "schemaVersion":
			v.SchemaVersion = int(in.Int())
		case "campaignId":
			v.CampaignID = string(in.String())
		case "storeCurrencyCode":
			v.StoreCurrencyCode = string(in.String())
		case "storeCurrencyDecimals":
			v.StoreCurrencyDecimals = int(in.Int())
		case "scope":
			v.Scope.UnmarshalEasyJSON(in)
		case "tiers":
			decodeDiscountTiers(in, &v.Tiers)
		default:
			in.SkipRecursive()
		}
		in.WantComma()
	}
	in.Delim('}')
	if isTopLevel {
		in.Consumed()
	}
}

func (v *ruleScope) UnmarshalEasyJSON(in *jlexer.Lexer) {
	if in.IsNull() {
		in.Skip()
		return
	}
	in.Delim('{')
	for !in.IsDelim('}') {
		key := in.UnsafeFieldName(false)
		in.WantColon()
		if in.IsNull() {
			in.Skip()
			in.WantComma()
			continue
		}
		switch key {
		case "kind":
			v.Kind = string(in.String())
		case "productIds":
			decodeStrings(in, &v.ProductIDs)
		case "collectionIds":
			decodeStrings(in, &v.CollectionIDs)
		case "resolvedProductIds":
			decodeStrings(in, &v.ResolvedProductIDs)
		case "excludedProductIds":
			decodeStrings(in, &v.ExcludedProductIDs)
		default:
			in.SkipRecursive()
		}
		in.WantComma()
	}
	in.Delim('}')
}

func (v *discountTier) UnmarshalEasyJSON(in *jlexer.Lexer) {
	if in.IsNull() {
		in.Skip()
		return
	}
	in.Delim('{')
	for !in.IsDelim('}') {
		key := in.UnsafeFieldName(false)
		in.WantColon()
		if in.IsNull() {
			if key == "discountValue" {
				v.DiscountValue = nil
			}
			in.Skip()
			in.WantComma()
			continue
		}
		switch key {
		case "tierId":
			v.TierID = string(in.String())
		case "quantity":
			v.Quantity = int64(in.Int64())
		case "discountType":
			v.DiscountType = string(in.String())
		case "discountValue":
			amount := int64(in.Int64())
			v.DiscountValue = &amount
		case "marketOverrides":
			decodeMarketOverrides(in, &v.MarketOverrides)
		default:
			in.SkipRecursive()
		}
		in.WantComma()
	}
	in.Delim('}')
}

func (v *marketOverride) UnmarshalEasyJSON(in *jlexer.Lexer) {
	if in.IsNull() {
		in.Skip()
		return
	}
	in.Delim('{')
	for !in.IsDelim('}') {
		key := in.UnsafeFieldName(false)
		in.WantColon()
		if in.IsNull() {
			switch key {
			case "amountMinor":
				v.AmountMinor = nil
			case "currencyDecimals":
				v.CurrencyDecimals = nil
			}
			in.Skip()
			in.WantComma()
			continue
		}
		switch key {
		case "mode":
			v.Mode = string(in.String())
		case "amountMinor":
			amount := int64(in.Int64())
			v.AmountMinor = &amount
		case "currencyCode":
			v.CurrencyCode = string(in.String())
		case "currencyDecimals":
			decimals := int(in.Int())
			v.CurrencyDecimals = &decimals
		default:
			in.SkipRecursive()
		}
		in.WantComma()
	}
	in.Delim('}')
}

func decodeStrings(in *jlexer.Lexer, values *[]string) {
	in.Delim('[')
	*values = (*values)[:0]
	for !in.IsDelim(']') {
		*values = append(*values, string(in.String()))
		in.WantComma()
	}
	in.Delim(']')
}

func decodeDiscountTiers(in *jlexer.Lexer, tiers *[]discountTier) {
	in.Delim('[')
	*tiers = (*tiers)[:0]
	for !in.IsDelim(']') {
		var tier discountTier
		tier.UnmarshalEasyJSON(in)
		*tiers = append(*tiers, tier)
		in.WantComma()
	}
	in.Delim(']')
}

func decodeMarketOverrides(in *jlexer.Lexer, overrides *map[string]marketOverride) {
	in.Delim('{')
	*overrides = make(map[string]marketOverride)
	for !in.IsDelim('}') {
		marketID := string(in.UnsafeFieldName(false))
		in.WantColon()
		var override marketOverride
		override.UnmarshalEasyJSON(in)
		(*overrides)[marketID] = override
		in.WantComma()
	}
	in.Delim('}')
}
