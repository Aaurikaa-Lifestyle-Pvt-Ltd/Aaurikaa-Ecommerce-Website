const express = require("express");
const router = express.Router();
const addressController = require("../controllers/addressController");
const verifyShopper = require("../middleware/verifyShopper");
const verifySeller = require("../middleware/verifySeller");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../utils/adminAuthChain");

router.get("/countries", addressController.getCountries);
router.get("/states/:countryId", addressController.getStatesByCountry);
router.get("/districts/:stateId", addressController.getDistrictsByState);

router.get("/shopper", verifyShopper, addressController.getUserAddresses);
router.get("/shopper/default", verifyShopper, addressController.getDefaultAddress);
router.get("/shopper/:id", verifyShopper, addressController.getAddressById);
router.post("/shopper", verifyShopper, addressController.createAddress);
router.put("/shopper/:id", verifyShopper, addressController.updateAddress);
router.delete("/shopper/:id", verifyShopper, addressController.deleteAddress);
router.patch("/shopper/:id/default", verifyShopper, addressController.setDefaultAddress);

router.get("/seller", verifySeller, addressController.getUserAddresses);
router.get("/seller/default", verifySeller, addressController.getDefaultAddress);
router.get("/seller/:id", verifySeller, addressController.getAddressById);
router.post("/seller", verifySeller, addressController.createAddress);
router.put("/seller/:id", verifySeller, addressController.updateAddress);
router.delete("/seller/:id", verifySeller, addressController.deleteAddress);
router.patch("/seller/:id/default", verifySeller, addressController.setDefaultAddress);

const adminLocationsView = [verifyAdmin, loadAdminContext, requirePermission("locations", "view")];
const adminLocationsManage = [verifyAdmin, loadAdminContext, requirePermission("locations", "manage")];

router.get("/admin", ...adminLocationsView, addressController.getUserAddresses);
router.get("/admin/default", ...adminLocationsView, addressController.getDefaultAddress);
router.get("/admin/:id", ...adminLocationsView, addressController.getAddressById);
router.post("/admin", ...adminLocationsManage, addressController.createAddress);
router.put("/admin/:id", ...adminLocationsManage, addressController.updateAddress);
router.delete("/admin/:id", ...adminLocationsManage, addressController.deleteAddress);
router.patch("/admin/:id/default", ...adminLocationsManage, addressController.setDefaultAddress);

module.exports = router;
