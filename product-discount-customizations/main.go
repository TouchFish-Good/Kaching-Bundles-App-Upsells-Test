//go:build tinygo

package main

import (
	"fmt"

	"github.com/mailru/easyjson"
	function "github.com/shoplinedev/function-extensions-template"
	discount "github.com/shoplinedev/function-extensions-template/templates/product-discount-customizations/internal/discount"
	"github.com/shoplinedev/function-extensions-template/templates/product-discount-customizations/module"
)

// The CLI appends its runtime wrapper to this file and compiles it alone.
var _, _, _ = fmt.Sprint, easyjson.Unmarshal, function.Log

func ProductDiscountCustomizationFunction(req *module.ProductDiscountCustomizationFunctionRequest) (response module.ProductDiscountCustomizationFunctionResponse) {
	function.Log("quantity-breaks: function entered")
	response = module.ProductDiscountCustomizationFunctionResponse{Discounts: []*module.ProductDiscount{}}
	defer func() {
		if recovered := recover(); recovered != nil {
			function.Log(fmt.Sprintf("quantity-breaks: recovered panic: %v", recovered))
			response = module.ProductDiscountCustomizationFunctionResponse{Discounts: []*module.ProductDiscount{}}
		}
	}()
	response = discount.EvaluateDiscountsWithTrace(req, function.Log)
	function.Log(fmt.Sprintf("quantity-breaks: computed discounts=%d", len(response.Discounts)))
	return response
}
