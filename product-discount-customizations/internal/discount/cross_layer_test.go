package discount

import (
	"fmt"
	"os"
	"testing"

	"github.com/mailru/easyjson"
	"github.com/shoplinedev/function-extensions-template/templates/product-discount-customizations/module"
)

// The Node integration test supplies a real serialized Worker rule and theme batch.
// No fixture builder or alternative request codec may normalize this boundary.
func TestOfferCrossLayerCodec(t *testing.T) {
	raw := os.Getenv("QB_LOCAL_INTEGRATION_REQUEST")
	if raw == "" {
		t.Skip("run tests/offer-modules/cross-layer.test.mjs to supply the serialized request")
	}
	var request module.ProductDiscountCustomizationFunctionRequest
	if err := easyjson.Unmarshal([]byte(raw), &request); err != nil {
		t.Fatal(err)
	}
	result := EvaluateDiscounts(&request)
	encoded, err := easyjson.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Println("QB_LOCAL_RESULT=" + string(encoded))
}
