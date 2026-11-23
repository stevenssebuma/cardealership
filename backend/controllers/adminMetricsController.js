import { analyticsRepository } from '../repositories/analyticsRepository.js';
import { queryProfiler } from '../utils/dbOptimizer.js';

export function createAdminMetricsController(repository = analyticsRepository) {
  const run = (name, fn) => async (req,res) => {
    try {
      const { result,duration } = await queryProfiler.profileQuery(name,fn);
      return res.json({ success:true,data:result,timestamp:new Date().toISOString(),meta:{ generationTime:duration+'ms' } });
    } catch (error) {
      console.error('Administrative metrics failed:',error.code || 'METRICS_FAILED');
      return res.status(500).json({success:false,error:'Unable to load administrative metrics.'});
    }
  };
  return Object.freeze({
    getMetrics:run('admin_metrics',async () => {
      const [inventory,bookings,users] = await Promise.all([repository.inventoryStats(),repository.bookingMetrics(),repository.userMetrics()]);
      return { inventory,bookings,users,revenue:repository.revenueMetrics(),searches:repository.searchMetrics(),timestamp:new Date().toISOString() };
    }),
    getInventoryMetrics:run('admin_inventory_metrics',()=>repository.inventoryStats()),
    getBookingMetrics:run('admin_booking_metrics',()=>repository.bookingMetrics()),
    getSearchMetrics:run('admin_search_metrics',()=>repository.searchMetrics()),
    getRevenueMetrics:run('admin_revenue_metrics',()=>repository.revenueMetrics()),
    getUserMetrics:run('admin_user_metrics',()=>repository.userMetrics()),
  });
}
export const adminMetricsController = createAdminMetricsController();
