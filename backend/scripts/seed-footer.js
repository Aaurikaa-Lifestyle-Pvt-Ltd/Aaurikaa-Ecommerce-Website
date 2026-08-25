// backend/scripts/seed-footer.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const SiteSettings = require('../models/SiteSettings');

const seedFooter = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        let settings = await SiteSettings.findOne().sort({ createdAt: 1 });
        if (!settings) {
            settings = new SiteSettings();
        }

        settings.footer = {
            copyright: `© 02/2020 - {{month}}/{{year}} ANBAZAR. All rights reserved.`,
            text: "Premium E-commerce platform for fashion and lifestyle.",
            columns: [
                {
                    title: "Customer Service",
                    links: [
                        { label: "FAQ", url: "/faq" },
                        { label: "Return Policy", url: "/returns-refund-policy" },
                        { label: "Delivery Info", url: "/delivery" },
                        { label: "Order View", url: "/orders" }
                    ]
                },
                {
                    title: "Company",
                    links: [
                        { label: "Contact Us", url: "/contact" },
                        { label: "About Us", url: "/about" },
                        { label: "Careers", url: "/careers" },
                        { label: "Vendor Dashboard", url: "/seller/dashboard" }
                    ]
                },
                {
                    title: "Support",
                    links: [
                        { label: "Help Center", url: "/help" },
                        { label: "Shipping", url: "/orders" },
                        { label: "Returns", url: "/returns-refund-policy" },
                        { label: "Order Tracking", url: "/orders" }
                    ]
                },
                {
                    title: "Legal",
                    links: [
                        { label: "Privacy Policy", url: "/privacy" },
                        { label: "Terms of Service", url: "/terms" },
                        { label: "Cookie Policy", url: "/cookies" },
                        { label: "Accessibility", url: "/accessibility" }
                    ]
                },
                {
                    title: "Account",
                    links: [
                        { label: "My Account", url: "/account" },
                        { label: "Order History", url: "/orders" },
                        { label: "Wishlist", url: "/wishlist" },
                        { label: "Become a Seller", url: "/seller/register" }
                    ]
                },
                {
                    title: "Top Categories",
                    links: [
                        { label: "Electronics", url: "/category/electronics" },
                        { label: "Cosmetics", url: "/category/cosmetics" },
                        { label: "Apparels", url: "/category/apparels" },
                        { label: "Furniture", url: "/category/furniture" }
                    ]
                }
            ],
            socialLinks: [
                { platform: "Email", iconAsset: "FaEnvelope", url: "mailto:support@anbazar.com", isEnabled: true, order: 1 },
                { platform: "WhatsApp", iconAsset: "FaWhatsapp", url: "https://wa.me/yourlink", isEnabled: true, order: 2 },
                { platform: "Facebook", iconAsset: "FaFacebookF", url: "https://facebook.com", isEnabled: true, order: 3 },
                { platform: "Instagram", iconAsset: "FaInstagram", url: "https://instagram.com", isEnabled: true, order: 4 },
                { platform: "Twitter", iconAsset: "FaTwitter", url: "https://twitter.com", isEnabled: true, order: 5 },
                { platform: "YouTube", iconAsset: "FaYoutube", url: "https://youtube.com", isEnabled: true, order: 6 }
            ],
            paymentIcons: [
                { name: "UPI", imageAsset: "/payments/UPI1.jpg", url: "", isEnabled: true, order: 1 },
                { name: "PhonePe", imageAsset: "/payments/phone.jpg", url: "", isEnabled: true, order: 2 },
                { name: "G-Pay", imageAsset: "/payments/G-pay.jpg", url: "", isEnabled: true, order: 3 },
                { name: "Visa", imageAsset: "FaCcVisa", url: "", isEnabled: true, order: 4 },
                { name: "Mastercard", imageAsset: "FaCcMastercard", url: "", isEnabled: true, order: 5 },
                { name: "Paypal", imageAsset: "FaCcPaypal", url: "", isEnabled: true, order: 6 }
            ]
        };

        await settings.save();
        console.log('✅ Footer settings seeded successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding error:', error);
        process.exit(1);
    }
};

seedFooter();
