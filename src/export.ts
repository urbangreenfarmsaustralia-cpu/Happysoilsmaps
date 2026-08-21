import type { ApplicationResult } from './calculations';
import type { SavedPlan } from './storage';

const csvCell = (value: string | number): string => `"${String(value).replaceAll('"', '""')}"`;

export function createPlanCsv(plan: SavedPlan, result: ApplicationResult): string {
  const rows: Array<[string, string | number]> = [
    ['Paddock', plan.paddockName],
    ['Property or farm', plan.propertyName],
    ['Street or rural address', plan.streetAddress],
    ['Locality or town', plan.locality],
    ['State', plan.state],
    ['Postcode', plan.postcode],
    ['Agricultural region', plan.region],
    ['Farming system', plan.farmingSystem],
    ['Area (ha)', plan.areaHa],
    ['Product or input', plan.productName],
    ['Approved rate', `${plan.ratePerHa} ${plan.rateUnit}`],
    ['Applications', plan.applications],
    ['Operational allowance (%)', plan.allowancePercent],
    [`Quantity per application (${result.baseUnit})`, result.quantityPerApplication],
    [`Total quantity (${result.baseUnit})`, result.totalQuantity],
    ['Whole packs required', result.packsRequired ?? 'Not calculated'],
    ['Notes', plan.notes],
  ];

  return ['Field,Value', ...rows.map(([key, value]) => `${csvCell(key)},${csvCell(value)}`)].join('\n');
}
