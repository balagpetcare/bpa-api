import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  createCountrySchema, updateCountrySchema,
  createDivisionSchema, updateDivisionSchema,
  createDistrictSchema, updateDistrictSchema,
  createCityCorporationSchema, updateCityCorporationSchema,
  createZoneSchema, updateZoneSchema,
  createVenueSchema, updateVenueSchema,
  locationListQuerySchema,
} from './locations.types';
import {
  createCountryHandler, listCountriesHandler, getCountryHandler, updateCountryHandler, deleteCountryHandler,
  createDivisionHandler, listDivisionsHandler, getDivisionHandler, updateDivisionHandler, deleteDivisionHandler,
  createDistrictHandler, listDistrictsHandler, getDistrictHandler, updateDistrictHandler, deleteDistrictHandler,
  createCityCorporationHandler, listCityCorporationsHandler, getCityCorporationHandler, updateCityCorporationHandler, deleteCityCorporationHandler,
  createZoneHandler, listZonesHandler, getZoneHandler, updateZoneHandler, deleteZoneHandler,
  createVenueHandler, listVenuesHandler, getVenueHandler, updateVenueHandler, deleteVenueHandler,
  getPublicHierarchyHandler, listPublicVenuesHandler,
} from './locations.controller';

const router = Router();

// ─── Public ─────────────────────────────────────────────────────

router.get('/public/hierarchy', publicReadLimiter, getPublicHierarchyHandler);
router.get('/public/venues', publicReadLimiter, validate(locationListQuerySchema, 'query'), listPublicVenuesHandler);

// ─── Admin (all require auth) ────────────────────────────────────

router.use(authenticate);

// Countries
router.get('/countries', authorize(RESOURCES.LOCATIONS, ACTIONS.READ), validate(locationListQuerySchema, 'query'), listCountriesHandler);
router.post('/countries', authorize(RESOURCES.LOCATIONS, ACTIONS.CREATE), validate(createCountrySchema), createCountryHandler);
router.get('/countries/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.READ), getCountryHandler);
router.patch('/countries/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.UPDATE), validate(updateCountrySchema), updateCountryHandler);
router.delete('/countries/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.DELETE), deleteCountryHandler);

// Divisions
router.get('/divisions', authorize(RESOURCES.LOCATIONS, ACTIONS.READ), validate(locationListQuerySchema, 'query'), listDivisionsHandler);
router.post('/divisions', authorize(RESOURCES.LOCATIONS, ACTIONS.CREATE), validate(createDivisionSchema), createDivisionHandler);
router.get('/divisions/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.READ), getDivisionHandler);
router.patch('/divisions/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.UPDATE), validate(updateDivisionSchema), updateDivisionHandler);
router.delete('/divisions/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.DELETE), deleteDivisionHandler);

// Districts
router.get('/districts', authorize(RESOURCES.LOCATIONS, ACTIONS.READ), validate(locationListQuerySchema, 'query'), listDistrictsHandler);
router.post('/districts', authorize(RESOURCES.LOCATIONS, ACTIONS.CREATE), validate(createDistrictSchema), createDistrictHandler);
router.get('/districts/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.READ), getDistrictHandler);
router.patch('/districts/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.UPDATE), validate(updateDistrictSchema), updateDistrictHandler);
router.delete('/districts/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.DELETE), deleteDistrictHandler);

// City Corporations
router.get('/city-corporations', authorize(RESOURCES.LOCATIONS, ACTIONS.READ), validate(locationListQuerySchema, 'query'), listCityCorporationsHandler);
router.post('/city-corporations', authorize(RESOURCES.LOCATIONS, ACTIONS.CREATE), validate(createCityCorporationSchema), createCityCorporationHandler);
router.get('/city-corporations/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.READ), getCityCorporationHandler);
router.patch('/city-corporations/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.UPDATE), validate(updateCityCorporationSchema), updateCityCorporationHandler);
router.delete('/city-corporations/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.DELETE), deleteCityCorporationHandler);

// Zones
router.get('/zones', authorize(RESOURCES.LOCATIONS, ACTIONS.READ), validate(locationListQuerySchema, 'query'), listZonesHandler);
router.post('/zones', authorize(RESOURCES.LOCATIONS, ACTIONS.CREATE), validate(createZoneSchema), createZoneHandler);
router.get('/zones/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.READ), getZoneHandler);
router.patch('/zones/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.UPDATE), validate(updateZoneSchema), updateZoneHandler);
router.delete('/zones/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.DELETE), deleteZoneHandler);

// Venues
router.get('/venues', authorize(RESOURCES.LOCATIONS, ACTIONS.READ), validate(locationListQuerySchema, 'query'), listVenuesHandler);
router.post('/venues', authorize(RESOURCES.LOCATIONS, ACTIONS.CREATE), validate(createVenueSchema), createVenueHandler);
router.get('/venues/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.READ), getVenueHandler);
router.patch('/venues/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.UPDATE), validate(updateVenueSchema), updateVenueHandler);
router.delete('/venues/:id', validateUuid('id'), authorize(RESOURCES.LOCATIONS, ACTIONS.DELETE), deleteVenueHandler);

export default router;
