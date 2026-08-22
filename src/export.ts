import type { ApplicationResult, OperationalResult } from './calculations';
import type { SavedPlan } from './storage';

const csvCell = (value: string | number): string => `"${String(value).replaceAll('"', '""')}"`;

export function createPlanCsv(
  plan: SavedPlan,
  result: ApplicationResult,
  operations?: OperationalResult | null,
): string {
  const rows: Array<[string, string | number]> = [
    ['Paddock', plan.paddockName],
    ['Property or farm', plan.propertyName],
    ['Street or rural address', plan.streetAddress],
    ['Locality or town', plan.locality],
    ['State', plan.state],
    ['Postcode', plan.postcode],
    ['Agricultural region', plan.region],
    ['Farming system', plan.farmingSystem],
    ['Job status', plan.status],
    ['Scheduled date', plan.scheduledDate],
    ['Area (ha)', plan.areaHa],
    ['Product or input', plan.productName],
    ['Approved rate', `${plan.ratePerHa} ${plan.rateUnit}`],
    ['Applications', plan.applications],
    ['Operational allowance (%)', plan.allowancePercent],
    ['Pack size', plan.packSize || 'Not entered'],
    ['Cost per pack (AUD)', plan.costPerPack || 'Not entered'],
    ['Water or carrier rate (L/ha)', plan.waterRateLHa || 'Not entered'],
    ['Tank capacity (L)', plan.tankCapacityL || 'Not entered'],
    [`Quantity per application (${result.baseUnit})`, result.quantityPerApplication],
    [`Total quantity (${result.baseUnit})`, result.totalQuantity],
    ['Whole packs required', result.packsRequired ?? 'Not calculated'],
    ['Estimated input cost (AUD)', operations?.estimatedInputCost ?? 'Not calculated'],
    ['Carrier volume per application (L)', operations?.carrierVolumePerApplicationL ?? 'Not calculated'],
    ['Total carrier volume (L)', operations?.totalCarrierVolumeL ?? 'Not calculated'],
    ['Tank loads per application', operations?.tankLoadsPerApplication ?? 'Not calculated'],
    ['Total tank loads', operations?.totalTankLoads ?? 'Not calculated'],
    ['Notes', plan.notes],
  ];

  return ['Field,Value', ...rows.map(([key, value]) => `${csvCell(key)},${csvCell(value)}`)].join('\n');
}
