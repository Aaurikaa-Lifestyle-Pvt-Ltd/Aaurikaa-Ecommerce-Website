const express = require("express");
const { withAdminAuth } = require("../utils/adminAuthChain");
const merchCollectionController = require("../controllers/merchCollectionController");
const occasionController = require("../controllers/occasionController");
const shopLookController = require("../controllers/shopLookController");
const styledByYouController = require("../controllers/styledByYouController");

function buildAdminRouter() {
  const router = express.Router();
  const homepageView = withAdminAuth("homepage", "view");
  const homepageManage = withAdminAuth("homepage", "manage");

  function mount(path, controller) {
    router.get(`/${path}`, ...homepageView, controller.listAdmin);
    router.post(`/${path}`, ...homepageManage, controller.create);
    router.get(`/${path}/:id`, ...homepageView, controller.getAdmin);
    router.put(`/${path}/:id`, ...homepageManage, controller.update);
    router.delete(`/${path}/:id`, ...homepageManage, controller.remove);
  }

  mount("collections", merchCollectionController);
  mount("occasions", occasionController);
  mount("looks", shopLookController);
  mount("ugc", styledByYouController);
  return router;
}

function buildPublicRouter() {
  const router = express.Router();
  router.get("/collections", merchCollectionController.listPublic);
  router.get("/collections/:slug", merchCollectionController.getPublicBySlug);
  router.get("/occasions", occasionController.listPublic);
  router.get("/occasions/:slug", occasionController.getPublicBySlug);
  router.get("/looks", shopLookController.listPublic);
  router.get("/looks/:slug", shopLookController.getPublicBySlug);
  router.get("/ugc", styledByYouController.listPublic);
  return router;
}

module.exports = {
  merchandisingAdminRoutes: buildAdminRouter(),
  merchandisingPublicRoutes: buildPublicRouter(),
};
