package discount

// Compact authoritative projection. It intentionally carries no catalog snapshots.
//
//easyjson:json
type offerModule struct {
	Version       int         `json:"version"`
	Enabled       *bool       `json:"enabled"`
	SelectionMode string      `json:"selectionMode"`
	QuantityMode  string      `json:"quantityMode"`
	QuotaScope    string      `json:"quotaScope"`
	Items         []offerRule `json:"items"`
}

//easyjson:json
type offerRule struct {
	RuleID            string                    `json:"ruleId"`
	DisplayOrder      *int64                    `json:"displayOrder"`
	ProductID         string                    `json:"productId"`
	AllowedVariantIDs []string                  `json:"allowedVariantIds"`
	Quantity          int64                     `json:"quantity"`
	DiscountType      string                    `json:"discountType"`
	DiscountValue     *int64                    `json:"discountValue"`
	MarketOverrides   map[string]marketOverride `json:"marketOverrides"`
	Trigger           offerTrigger              `json:"trigger"`
}

//easyjson:json
type offerTrigger struct {
	Type     string   `json:"type"`
	TierIDs  []string `json:"tierIds"`
	Operator string   `json:"operator"`
	Quantity int64    `json:"quantity"`
}
