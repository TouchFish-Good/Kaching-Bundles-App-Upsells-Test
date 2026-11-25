import type { WorkspacePage } from "./model";

export type WorkspaceLocation =
  | { page: WorkspacePage | "not-found"; campaignId: string | null }
  | { page: "discount-detail"; campaignId: null; platformDiscountId: string };

export function readWorkspaceLocation(pathname: string): WorkspaceLocation {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/quantity-breaks") return { page: "dashboard", campaignId: null };
  if (path === "/quantity-breaks/new") return { page: "editor", campaignId: null };
  if (path === "/quantity-breaks/widget") return { page: "dashboard", campaignId: null };
  if (path === "/quantity-breaks/translations") return { page: "translations", campaignId: null };
  if (path === "/quantity-breaks/feedback") return { page: "feedback", campaignId: null };
  if (path === "/quantity-breaks/plan") return { page: "plan", campaignId: null };
  const detail = path.match(/^\/quantity-breaks\/campaigns\/([^/]+)$/);
  if (detail) {
    try {
      const id = decodeURIComponent(detail[1]);
      if (id && !id.includes("/")) return { page: "detail", campaignId: id };
    } catch { return { page: "not-found", campaignId: null }; }
  }
  const discountDetail = path.match(/^\/product-discount-customizations\/([^/]+)\/([^/]+)$/)
    ?? path.match(/^\/admin\/apps\/[^/]+\/product-discount-customizations\/([^/]+)\/([^/]+)$/);
  if (discountDetail) {
    try {
      const functionId = decodeURIComponent(discountDetail[1]);
      const platformDiscountId = decodeURIComponent(discountDetail[2]);
      if (functionId && platformDiscountId && !functionId.includes("/") && !platformDiscountId.includes("/")) {
        return { page: "discount-detail", campaignId: null, platformDiscountId };
      }
    } catch {
      return { page: "not-found", campaignId: null };
    }
  }
  const edit = path.match(/^\/quantity-breaks\/campaigns\/([^/]+)\/edit$/);
  if (edit) {
    try {
      const id = decodeURIComponent(edit[1]);
      if (id && !id.includes("/")) return { page: "editor", campaignId: id };
    } catch {
      return { page: "not-found", campaignId: null };
    }
  }
  return { page: "not-found", campaignId: null };
}

export function workspaceHref(page: WorkspacePage, campaignId?: string): string {
  if (page === "editor") return campaignId ? `/quantity-breaks/campaigns/${encodeURIComponent(campaignId)}/edit` : "/quantity-breaks/new";
  if (page === "detail") return campaignId ? `/quantity-breaks/campaigns/${encodeURIComponent(campaignId)}` : "/quantity-breaks";
  if (page === "widget") return "/quantity-breaks";
  if (page === "translations") return "/quantity-breaks/translations";
  if (page === "feedback") return "/quantity-breaks/feedback";
  if (page === "plan") return "/quantity-breaks/plan";
  return "/quantity-breaks";
}
