const { requireAnyPermission, requirePermission } = require('../../middleware/requirePermission');
const { hasPermission } = require('../../utils/adminPermissions');

jest.mock('../../config/permissionEnforcement', () => ({
  isDomainEnforced: jest.fn((domain) =>
    ['promotions', 'homepage', 'catalog'].includes(domain)
  ),
}));

describe('requireAnyPermission', () => {
  function buildRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  }

  it('allows homepage:manage when promotions:manage is missing', () => {
    const mw = requireAnyPermission([
      { domain: 'promotions', action: 'manage' },
      { domain: 'homepage', action: 'manage' },
    ]);
    const req = {
      adminUser: {
        isSuperAdmin: false,
        permissions: ['homepage:manage'],
      },
    };
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects when neither permission is present', () => {
    const mw = requireAnyPermission([
      { domain: 'promotions', action: 'manage' },
      { domain: 'homepage', action: 'manage' },
    ]);
    const req = {
      adminUser: {
        isSuperAdmin: false,
        permissions: ['catalog:view'],
      },
    };
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('requirePermission still gates a single domain', () => {
    expect(hasPermission({ isSuperAdmin: true }, 'promotions', 'manage')).toBe(true);
    const mw = requirePermission('promotions', 'manage');
    const req = {
      adminUser: { isSuperAdmin: false, permissions: ['homepage:manage'] },
    };
    const res = buildRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});
