# Utility Scripts

This directory contains utility scripts for managing the multi-vendor e-commerce platform, including user management and data migrations.

## Available Scripts

### 1. Setup Users (`setup-users.js`)

Creates initial user profiles for development and testing.

**Usage:**
```bash
npm run setup-users
# or
node scripts/setup-users.js
```

**What it does:**
- Creates an Admin user with full access
- Creates a Shopper (customer) user
- Creates a Seller (vendor) user with pre-approval
- All passwords are hashed using bcrypt
- Displays login credentials for easy access

**Default Credentials:**
- **Admin**: admin@vendor-ecom.com / Admin@123456
- **Shopper**: john.doe@example.com / Shopper@123456
- **Seller**: jane.smith@example.com / Seller@123456

### 2. Verify Users (`verify-users.js`)

Verifies that users were created successfully and displays their details.

**Usage:**
```bash
npm run verify-users
# or
node scripts/verify-users.js
```

**What it does:**
- Checks if all three user types exist in the database
- Displays detailed information about each user
- Shows database summary with total counts
- Confirms user creation was successful

## User Types

### Admin
- **Role**: Full system access
- **Capabilities**: Manage all users, products, orders, settings
- **Access**: Admin dashboard, user management, system configuration

### Shopper
- **Role**: Customer
- **Capabilities**: Browse products, add to cart, place orders
- **Access**: Product catalog, shopping cart, order history

### Seller
- **Role**: Vendor
- **Capabilities**: Manage own products, view orders, track sales
- **Access**: Seller dashboard, product management, order tracking
- **Status**: Pre-approved for immediate access

## Security Notes

⚠️ **Important Security Considerations:**

1. **Development Only**: These are default credentials for development/testing
2. **Change Passwords**: Update passwords before production deployment
3. **Environment Variables**: Ensure proper environment configuration
4. **Database Security**: Use secure database connections in production
5. **Credential Storage**: Never commit real credentials to version control

## Environment Requirements

Make sure you have the following environment variables set:

```env
MONGODB_URI=mongodb://localhost:27017/vendor-ecom
# or
MONGO_URL=mongodb://localhost:27017/vendor-ecom
```

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Ensure MongoDB is running
   - Check connection string in environment variables
   - Verify database permissions

2. **User Already Exists**
   - Scripts will skip existing users
   - Use verification script to check current state
   - Delete users manually if needed

3. **Permission Errors**
   - Ensure proper file permissions on script files
   - Check Node.js and npm installation

### Manual User Creation

If you need to create users manually, you can use the MongoDB shell:

```javascript
// Connect to MongoDB
use vendor-ecom

// Create admin (password: Admin@123456)
db.admins.insertOne({
  name: "Super Admin",
  username: "admin",
  email: "admin@vendor-ecom.com",
  phone: "+1234567890",
  password: "$2a$10$...", // bcrypt hash
  role: "admin"
})
```

## Script Development

### Adding New Scripts

1. Create new `.js` file in this directory
2. Add script entry to `package.json`
3. Include proper error handling and logging
4. Update this README with documentation

### Best Practices

- Always use environment variables for configuration
- Include proper error handling and logging
- Make scripts idempotent (safe to run multiple times)
- Include verification steps
- Document all functionality

## Review Migration Scripts

### 1. Migrate Reviews - Dry Run (`migrate-reviews-dryrun.js`)

Preview what would be migrated from embedded Product reviews to the Review collection.

**Usage:**
```bash
node backend/scripts/migrate-reviews-dryrun.js
```

**What it does:**
- Analyzes products with embedded reviews
- Shows migration plan without making changes
- Identifies potential issues (missing sellers, invalid data)
- Calculates expected ratings
- Shows seller rating impact

**⚠️ Safe to run** - No database changes are made.

### 2. Migrate Reviews (`migrate-reviews.js`)

Migrates embedded reviews from Product model to Review collection.

**Usage:**
```bash
node backend/scripts/migrate-reviews.js
```

**What it does:**
- Finds products with embedded reviews
- Creates Review documents from embedded reviews
- Sets productSku for persistence after product deletion
- Links reviews to sellers
- Calculates and updates product avgRating and reviewCount
- Calculates and updates seller avgRating, reviewCount, and ratingBreakdown
- Handles duplicate reviews (updates existing if found)

**⚠️ Modifies database** - Run dry-run first to preview changes.

**Prerequisites:**
- Review model must be created
- Product and Seller models must be updated
- Rating aggregation service must be available

### 3. Verify Reviews Migration (`verify-reviews-migration.js`)

Verifies data integrity after review migration.

**Usage:**
```bash
node backend/scripts/verify-reviews-migration.js
```

**What it verifies:**
- All reviews were migrated correctly
- Product ratings match Review collection
- Seller ratings match Review collection
- No orphaned reviews (reviews for deleted products - intentional per SRS)
- Data consistency across collections

**Reports:**
- Total reviews by role (shopper, seller, admin)
- Products with mismatched ratings
- Sellers with mismatched ratings
- Orphaned reviews (expected for deleted products)
- Reviews without valid sellers (needs attention)

## Support

For issues or questions regarding these scripts:

1. Check the troubleshooting section above
2. Review the main project documentation
3. Check database connection and permissions
4. Verify environment variable configuration
