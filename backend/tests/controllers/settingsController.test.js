jest.mock("../../models/SiteSettings");
jest.mock("../../utils/cache", () => ({
  get: jest.fn(() => null),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(() => []),
}));

const SiteSettings = require("../../models/SiteSettings");
const { getSite, updateSite } = require("../../controllers/settingsController");

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe("settingsController site settings (platform return policy retired)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns site branding fields without platform return policy", async () => {
    const res = createResponse();
    SiteSettings.findOne.mockReturnValueOnce({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        title: "Anbazar",
        tagline: "Shop local",
        recentlyViewedVisibleCount: 6,
      }),
    });

    await getSite({}, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Anbazar",
        tagline: "Shop local",
        recentlyViewedVisibleCount: 6,
      })
    );
    expect(res.json.mock.calls[0][0].returnWindowDays).toBeUndefined();
    expect(res.json.mock.calls[0][0].returnAllowed).toBeUndefined();
  });

  it("updates title without requiring return window fields", async () => {
    const settings = { save: jest.fn().mockResolvedValue(undefined) };
    SiteSettings.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(settings),
    });
    const res = createResponse();

    await updateSite({ body: { title: "New Title" }, files: undefined }, res);

    expect(settings.title).toBe("New Title");
    expect(settings.save).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      message: "✅ Site settings updated",
    });
  });
});
