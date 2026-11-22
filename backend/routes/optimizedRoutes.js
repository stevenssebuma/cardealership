import express from 'express';
import { analyticsRepository } from '../repositories/analyticsRepository.js';
import { queryProfiler } from '../utils/dbOptimizer.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

export function createOptimizedRouter(repository = analyticsRepository) {
  const router = express.Router();
  const respond = (label, handler) => async (req,res) => {
    try {
      const { result } = await queryProfiler.profileQuery(label, () => handler(req));
      return res.status(result.status ?? 200).json(result.body);
    } catch (error) {
      if (error.code === 'INVALID_QUERY') return res.status(400).json({ success:false,error:error.message });
      console.error('Optimized query failed:',error.code || 'QUERY_FAILED');
      return res.status(500).json({ success:false,error:'Unable to process query.' });
    }
  };
  router.get('/search',respond('optimized_search',async req => {
    const { data,total,limit,offset } = await repository.searchInventory(req.query);
    return { body:{ success:true,data,meta:{ total,limit,offset,returned:data.length } } };
  }));
  router.get('/availability',respond('optimized_availability',async req => {
    const { carId,date,timeSlot } = req.query;
    const { present,available,bookedBy } = await repository.availability(carId,date,timeSlot);
    return present ? { body:{ success:true,data:{ available,bookedBy } } } : { status:404,body:{ success:false,error:'Vehicle not found.' } };
  }));
  router.get('/stats',respond('optimized_stats',async () => ({ body:{ success:true,data:await repository.inventoryStats({publicOnly:true}) } })));
  router.get('/most-searched', (req,res) => {
    const metrics = repository.searchMetrics();
    return res.json({ success:true,data:metrics.mostSearchedMakes,meta:{ available:metrics.available,reason:metrics.reason } });
  });
  router.get('/performance',protect,adminOnly,(req,res) => res.json({success:true,data:queryProfiler.getStats()}));
  return router;
}
export default createOptimizedRouter();
