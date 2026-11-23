import { performance } from 'node:perf_hooks';
import { createAnalyticsRepository } from '../repositories/analyticsRepository.js';

// Process-local telemetry, not a persistent or alternative datastore.
// Only operation labels and durations are retained, never SQL parameters.
class QueryProfiler {
  constructor() { this.resetLogs(); }
  resetLogs() { this.total = 0; this.errors = 0; this.slow = 0; this.duration = 0; this.slowLogs = []; }
  async profileQuery(name, queryFn, params = []) {
    const start = performance.now();
    let result, error;
    try { result = await queryFn(...params); } catch (caught) { error = caught; }
    const duration = Math.round(performance.now() - start);
    const logEntry = { queryName: name, duration, timestamp: new Date().toISOString(), status: error ? 'ERROR' : 'SUCCESS', isSlow: duration > 100 };
    this.total++; this.duration += duration;
    if (error) this.errors++;
    if (logEntry.isSlow) { this.slow++; this.slowLogs.push(logEntry); if (this.slowLogs.length > 10) this.slowLogs.shift(); }
    if (error) throw error;
    return { result, duration, logEntry };
  }
  getStats() {
    return { totalQueries:this.total, slowQueries:this.slow, errorQueries:this.errors, avgDuration:this.total ? Math.round(this.duration/this.total) : 0,
      slowQueryLogs:[...this.slowLogs], slowQueryPercent:this.total ? (100*this.slow/this.total).toFixed(1)+'%' : '0%', source:'process_local_query_profiler' };
  }
}
export const queryProfiler = new QueryProfiler();
export const queryOptimizer = Object.freeze({
  async searchInventory(db, params) { return (await createAnalyticsRepository(db).searchInventory(params)).data; },
  async checkBookingAvailability(db, carId, date, timeSlot) { const { available, bookedBy } = await createAnalyticsRepository(db).availability(carId,date,timeSlot); return { available, bookedBy }; },
  async getBookingsByDateRange(db, startDate, endDate, status = null) { return createAnalyticsRepository(db).getBookingsByDateRange(startDate,endDate,status); },
  async getInventoryStats(db) { const stats = await createAnalyticsRepository(db).inventoryStats(); return { ...stats, count:stats.totalCars }; },
  async getMostSearchedMakes(db) { return createAnalyticsRepository(db).searchMetrics().mostSearchedMakes; },
  async getMonthlyBookingStats(db, year, month) { return createAnalyticsRepository(db).getMonthlyBookingStats(year,month); },
});
