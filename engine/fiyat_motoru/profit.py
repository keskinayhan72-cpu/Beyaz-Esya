"""İşlem kârı hesabı — web/src/lib/domain/profit.ts ile aynı formül.

Ortak test vektörleri: shared/profit_vectors.json. Alarm/bildirim aşamasında
motor tarafında kâr eşiği kontrolü için kullanılacak.
"""
from __future__ import annotations

import math

FIELDS = ("purchaseGross", "purchaseShippingGross", "kdvRate", "serviceKdvRate", "inboundNet",
          "saleGross", "commissionRate", "paymentFeeRate", "fixedFeeNet", "outboundShippingNet",
          "returnRate", "returnLossRate", "annualCapitalCostRate", "daysInStock",
          "storageCostMonthNet", "handlingNet", "withholdingRate")


def calculate_profit(i: dict[str, float]) -> dict[str, float | None]:
    for k in FIELDS:
        v = i[k]
        if not isinstance(v, (int, float)) or math.isnan(v) or math.isinf(v) or v < 0:
            raise ValueError(f"Geçersiz değer: {k}={v}")
    base = i.get("commissionBase", "gross")
    if base not in ("gross", "net"):
        raise ValueError(f"commissionBase geçersiz: {base}")
    on_net = base == "net"
    k, sk = i["kdvRate"], i["serviceKdvRate"]
    sale_net = i["saleGross"] / (1 + k)
    purchase_net = i["purchaseGross"] / (1 + k)
    purchase_ship_net = i["purchaseShippingGross"] / (1 + sk)
    commission = (sale_net if on_net else i["saleGross"]) * i["commissionRate"]
    payment_fee = i["saleGross"] * i["paymentFeeRate"] + i["fixedFeeNet"]
    return_risk = i["returnRate"] * (2 * i["outboundShippingNet"] + i["returnLossRate"] * purchase_net)
    holding = (purchase_net * i["annualCapitalCostRate"] * (i["daysInStock"] / 365)
               + i["storageCostMonthNet"] * (i["daysInStock"] / 30))
    fixed_costs = (purchase_net + purchase_ship_net + i["inboundNet"] + i["fixedFeeNet"]
                   + i["outboundShippingNet"] + return_risk + holding + i["handlingNet"])
    total_cost = fixed_costs + commission + i["saleGross"] * i["paymentFeeRate"]
    net = sale_net - total_cost
    capital = purchase_net + purchase_ship_net + i["inboundNet"]
    output_vat = i["saleGross"] - sale_net
    input_vat = ((i["purchaseGross"] - purchase_net) + (i["purchaseShippingGross"] - purchase_ship_net)
                 + sk * (commission + payment_fee + i["outboundShippingNet"] + i["inboundNet"]))
    per_unit = 1 / (1 + k) - (i["commissionRate"] / (1 + k) if on_net else i["commissionRate"]) - i["paymentFeeRate"]
    return {
        "saleNet": sale_net, "purchaseNet": purchase_net, "purchaseShippingNet": purchase_ship_net,
        "inboundNet": i["inboundNet"], "commissionNet": commission, "paymentFeeNet": payment_fee,
        "outboundShippingNet": i["outboundShippingNet"], "returnRiskNet": return_risk,
        "holdingCostNet": holding, "handlingNet": i["handlingNet"], "totalCostNet": total_cost,
        "netProfit": net, "margin": net / sale_net if sale_net > 0 else 0.0,
        "roi": net / capital if capital > 0 else 0.0, "outputVat": output_vat, "inputVat": input_vat,
        "vatPayable": output_vat - input_vat, "withholding": sale_net * i["withholdingRate"],
        "cashOutlay": i["purchaseGross"] + i["purchaseShippingGross"],
        "breakEvenSaleGross": fixed_costs / per_unit if per_unit > 0 else None,
    }
