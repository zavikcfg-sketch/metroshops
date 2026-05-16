import { connect } from "../repository.js";

export function getPlan(planId) {
  return connect().prepare("SELECT * FROM platform_plans WHERE id = ?").get(planId || "free");
}

export function getTenantPlan(tenant) {
  return getPlan(tenant.plan_id || "free");
}

export function countTenantProducts(botId) {
  return connect()
    .prepare("SELECT COUNT(*) AS c FROM products WHERE bot_id = ?")
    .get(botId).c;
}

export function countAllTenants() {
  return connect().prepare("SELECT COUNT(*) AS c FROM tenant_bots").get().c;
}

export function assertCanAddProduct(botId, planId) {
  const plan = getPlan(planId);
  const n = countTenantProducts(botId);
  if (n >= plan.max_products) {
    throw new Error(`Лимит тарифа «${plan.name}»: максимум ${plan.max_products} товаров`);
  }
}

export function assertCanAddTenant(planId) {
  const plan = getPlan(planId);
  const n = countAllTenants();
  if (n >= plan.max_tenants) {
    throw new Error(`Лимит платформы: максимум ${plan.max_tenants} ботов на тарифе ${plan.name}`);
  }
}

export function listPlans() {
  return connect().prepare("SELECT * FROM platform_plans ORDER BY price_rub").all();
}
