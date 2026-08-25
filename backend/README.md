
<!-- // README.md -->


/*
# 🛍️ Multi-Vendor eCommerce Full-Stack Project

This project is a full-featured multi-vendor eCommerce system built with:
- **Backend:** Node.js + Express + MongoDB
- **Frontend:** Next.js + Tailwind CSS

## 🚀 Features
- Admin, Seller, Shopper Login/Register (JWT Auth)
- Product CRUD (Image upload supported)
- Admin Dashboard with users/products view
- Product search + price filter
- Order system with UPI/COD method
- About & Contact pages

## 📁 Folder Structure
```
multi-vendor-ecommerce/
├── backend/
│   ├── models/
│   ├── routes/
│   ├── controllers/
│   ├── middleware/
│   └── server.js
├── frontend/
│   ├── pages/
│   ├── components/
│   ├── styles/
│   └── next.config.js
```

## ⚙️ Setup Instructions

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with Mongo URI and JWT secret
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 🔐 Admin Login
Go to `/admin/login` and log in with admin credentials (created via /register).

## 📷 Product Image Upload
- Uses `multer` for storing images in `backend/uploads`
- Images are served via `/uploads/{filename}`

## 💳 Payments
- UPI: Static page or UPI QR (manual)
- COD: Option in Order page dropdown

---
Made with ❤️ by [Your Name]