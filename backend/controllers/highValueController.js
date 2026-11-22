import db from '../config/db.js';
import { createAnalyticsRepository, vehicleRow } from '../repositories/analyticsRepository.js';

const HIGH_VALUE_THRESHOLD=250000000;
const LUXURY_BADGES=['Land Cruiser','G-Wagon','Range Rover','LX570','S-Class','7-Series','A8','Cayenne','Taycan'];
const PERFORMANCE_BADGES=['AMG','M Power','RS','Turbo','GT'];
const FEATUREABLE = "lower(c.status) IN ('available','pending test drive','reserved')";
const invalid = message => Object.assign(new Error(message),{code:'INVALID_QUERY'});
const notFound = () => Object.assign(new Error('Vehicle not found.'),{code:'VEHICLE_NOT_FOUND'});
const hasBadge = (vehicle,badge) => [vehicle.model,vehicle.make].some(value=>typeof value==='string' && value.includes(badge));
const has = (vehicle,badges) => badges.some(badge=>hasBadge(vehicle,badge));
const makeId = value => {
  if (!['string','number'].includes(typeof value) || !/^\d+$/.test(String(value)) || Number(value)<1 || Number(value)>2147483647) throw invalid('Invalid vehicle ID.');
  return Number(value);
};
function spotlightResult(vehicle, now = Date.now()) {
  const isHighValue=vehicle.price>=HIGH_VALUE_THRESHOLD, isLuxury=has(vehicle,LUXURY_BADGES), isPerformance=has(vehicle,PERFORMANCE_BADGES);
  const eligible=['available','pending test drive','reserved'].includes(String(vehicle.status).toLowerCase());
  let score=vehicle.price>=300000000?30:vehicle.price>=250000000?20:vehicle.price>=200000000?10:0;
  for (const badge of LUXURY_BADGES) { if (vehicle.model?.includes(badge)) score+=15; if (vehicle.make?.includes(badge)) score+=10; }
  for (const badge of PERFORMANCE_BADGES) { if (vehicle.model?.includes(badge)) score+=10; if (vehicle.make?.includes(badge)) score+=5; }
  const condition=String(vehicle.condition??'').toLowerCase();
  if (condition==='new') score+=10; else if (condition==='excellent') score+=5;
  const days=(now-new Date(vehicle.created_at ?? vehicle.createdAt).getTime())/86400000;
  if (days>=0 && days<7) score+=15; else if (days>=0 && days<30) score+=5;
  score=Math.min(score,100);
  const tier=score>=80?'Platinum':score>=60?'Gold':score>=40?'Silver':'Bronze';
  const reason=[isHighValue?'High-value vehicle':null,isLuxury?'Luxury badge':null,isPerformance?'Performance badge':null,condition==='new'?'New arrival':null].filter(Boolean).join(' | ') || 'Featured vehicle';
  return {vehicleId:vehicle.id,qualifiesForSpotlight:eligible&&(isHighValue||isLuxury||isPerformance),spotlightScore:score,spotlightTier:tier,isHighValue,isLuxury,isPerformance,reason};
}
export function createHighValueAlertSystem(database=db) {
  const analytics=createAnalyticsRepository(database);
  const processNewVehicle=async input=>{
    const id=makeId(typeof input==='object' ? input?.id : input);
    return database.withTransaction(async tx=>{
      const current=await tx.query('SELECT * FROM cars WHERE id=$1 FOR UPDATE',[id]);
      if (!current.rowCount) throw notFound();
      // Re-read the authoritative record; never trust a webhook's price/status.
      const result=spotlightResult(vehicleRow(current.rows[0]));
      if (!result.qualifiesForSpotlight) await tx.query('DELETE FROM vehicle_spotlights WHERE car_id=$1',[id]);
      else await tx.query(`INSERT INTO vehicle_spotlights(car_id,score,tier,reason) VALUES($1,$2,$3,$4)
        ON CONFLICT(car_id) DO UPDATE SET score=EXCLUDED.score,tier=EXCLUDED.tier,reason=EXCLUDED.reason,
        is_read=FALSE,tagged_at=CURRENT_TIMESTAMP
        WHERE (vehicle_spotlights.score,vehicle_spotlights.tier,vehicle_spotlights.reason)
          IS DISTINCT FROM (EXCLUDED.score,EXCLUDED.tier,EXCLUDED.reason)`,[id,result.spotlightScore,result.spotlightTier,result.reason]);
      return result;
    });
  };
  async function getAlerts(unreadOnly=false) {
    const rows=(await database.query(`SELECT s.id,s.car_id,s.score,s.tier,s.reason,s.is_read,s.tagged_at,c.make,c.brand,c.model,c.price,c.year
      FROM vehicle_spotlights s JOIN cars c ON c.id=s.car_id WHERE ($1::boolean=FALSE OR NOT s.is_read) ORDER BY s.tagged_at DESC,s.id DESC`,[unreadOnly])).rows;
    return rows.map(row=>({ id:row.id,type:'FEATURED_SPOTLIGHT',vehicleId:row.car_id,
      vehicleDetails:{make:row.make??row.brand,model:row.model,price:Number(row.price??0),year:row.year},
      spotlights:{score:row.score,tier:row.tier,qualifies:true},priority:row.score>=80?'HIGH':'MEDIUM',
      message:`Spotlight vehicle: ${row.make??row.brand??''} ${row.model??''} — ${row.tier}`,
      createdAt:row.tagged_at,isRead:row.is_read }));
  }
  async function markAlertAsRead(id) {
    if (!['string','number'].includes(typeof id) || !/^\d+$/.test(String(id)) || BigInt(id)<1n || BigInt(id)>9223372036854775807n) throw invalid('Invalid alert ID.');
    return (await database.query('UPDATE vehicle_spotlights SET is_read=TRUE WHERE id=$1',[String(id)])).rowCount>0;
  }
  async function getFeaturedVehicles(limit=10) {
    if (!['string','number'].includes(typeof limit)||!/^\d+$/.test(String(limit))||Number(limit)<1||Number(limit)>100) throw invalid('Invalid limit.');
    const rows=(await database.query(`SELECT c.*,s.score,s.tier,s.reason,s.tagged_at FROM vehicle_spotlights s JOIN cars c ON c.id=s.car_id WHERE ${FEATUREABLE} ORDER BY s.score DESC,c.id LIMIT $1`,[Number(limit)])).rows;
    return rows.map(({score,tier,reason,tagged_at,...car})=>({...vehicleRow(car),isFeatured:true,spotlightScore:score,spotlightTier:tier,spotlightReason:reason,spotlight:{score,tier,reason,taggedAt:tagged_at}}));
  }
  async function getHighValueStats() {
    const cars=await analytics.listInventory();
    const highValue=cars.filter(c=>c.price>=HIGH_VALUE_THRESHOLD);
    const featured=await database.query(`SELECT count(*) AS n FROM vehicle_spotlights s JOIN cars c ON c.id=s.car_id WHERE ${FEATUREABLE}`);
    return {totalCars:cars.length,highValueCount:highValue.length,highValuePercentage:(cars.length?100*highValue.length/cars.length:0).toFixed(1),
      luxuryCount:cars.filter(c=>has(c,LUXURY_BADGES)).length,performanceCount:cars.filter(c=>has(c,PERFORMANCE_BADGES)).length,
      featuredCount:Number(featured.rows[0].n),totalValue:cars.reduce((sum,c)=>sum+Number(c.price??0),0),highValueValue:highValue.reduce((sum,c)=>sum+Number(c.price??0),0)};
  }
  async function processAllVehicles() {
    const ids=(await database.query('SELECT id FROM cars ORDER BY id')).rows;
    const results=[];
    for (const {id} of ids) { try { results.push(await processNewVehicle(id)); } catch(error) { if(error.code!=='VEHICLE_NOT_FOUND') throw error; } }
    return {processed:results.length,featured:results.filter(r=>r.qualifiesForSpotlight).length,results};
  }
  return Object.freeze({processNewVehicle,getAlerts,markAlertAsRead,getFeaturedVehicles,getHighValueStats,processAllVehicles,
    qualifiesForSpotlight:vehicle=>spotlightResult(vehicle).qualifiesForSpotlight,
    getSpotlightScore:vehicle=>spotlightResult(vehicle).spotlightScore,
    getSpotlightTier:score=>score>=80?'Platinum':score>=60?'Gold':score>=40?'Silver':'Bronze',
    getSpotlightReason:vehicle=>spotlightResult(vehicle).reason});
}
export function createHighValueController(system) {
  const handle=fn=>async(req,res)=>{
    try { return res.json({success:true,...await fn(req)}); }
    catch(error) {
      const status=error.code==='INVALID_QUERY'?400:error.code==='VEHICLE_NOT_FOUND'?404:500;
      if(status===500) console.error('Spotlight operation failed:',error.code||'SPOTLIGHT_FAILED');
      return res.status(status).json({success:false,error:status===500?'Spotlight operation failed.':error.message});
    }
  };
  return Object.freeze({
    processVehicle:handle(async req=>({data:await system.processNewVehicle(req.params.vehicleId)})),
    getAlerts:handle(async req=>{const data=await system.getAlerts(req.query.unread==='true');return {data,total:data.length};}),
    markAlertRead:handle(async req=>{if(!await system.markAlertAsRead(req.params.alertId)) throw Object.assign(new Error('Alert not found.'),{code:'VEHICLE_NOT_FOUND'});return {message:'Alert marked as read'};}),
    getFeaturedVehicles:handle(async req=>{const data=await system.getFeaturedVehicles(req.query.limit??10);return {data,total:data.length};}),
    getHighValueStats:handle(async()=>({data:await system.getHighValueStats(),timestamp:new Date().toISOString()})),
    processAllVehicles:handle(async()=>({data:await system.processAllVehicles(),timestamp:new Date().toISOString()})),
    vehicleCreatedWebhook:handle(async req=>({data:await system.processNewVehicle(req.body?.id),message:'Vehicle processed for spotlight'})),
  });
}
export const highValueAlertSystem=createHighValueAlertSystem();
export const highValueController=createHighValueController(highValueAlertSystem);
export default highValueController;
