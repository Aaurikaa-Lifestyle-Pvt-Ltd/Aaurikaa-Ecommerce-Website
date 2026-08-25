const express = require("express");
const router = express.Router();
const {
  getCountries,
  addCountry,
  updateCountry,
  deleteCountry,
  getStates,
  addState,
  updateState,
  deleteState,
  getDistricts,
  addDistrict,
  updateDistrict,
  deleteDistrict,
} = require("../../controllers/admin/locationController");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../../utils/adminAuthChain");

router.use(verifyAdmin, loadAdminContext);

router.get("/countries", requirePermission("locations", "view"), getCountries);
router.post("/countries", requirePermission("locations", "manage"), addCountry);
router.put("/countries/:id", requirePermission("locations", "manage"), updateCountry);
router.delete("/countries/:id", requirePermission("locations", "manage"), deleteCountry);

router.get("/states", requirePermission("locations", "view"), getStates);
router.post("/states", requirePermission("locations", "manage"), addState);
router.put("/states/:id", requirePermission("locations", "manage"), updateState);
router.delete("/states/:id", requirePermission("locations", "manage"), deleteState);

router.get("/districts", requirePermission("locations", "view"), getDistricts);
router.post("/districts", requirePermission("locations", "manage"), addDistrict);
router.put("/districts/:id", requirePermission("locations", "manage"), updateDistrict);
router.delete("/districts/:id", requirePermission("locations", "manage"), deleteDistrict);

module.exports = router;
