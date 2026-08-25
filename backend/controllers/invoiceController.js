const PDFDocument = require("pdfkit");
const Order = require("../models/Order");

exports.downloadInvoice = async (req, res) => {
  const { orderId } = req.params;
  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=invoice-${orderId}.pdf`);

    doc.text("🧾 INVOICE", { align: "center" });
    doc.text(`Order ID: ${order._id}`);
    doc.text(`Amount: ₹${order.totalAmount}`);
    doc.text(`Status: ${order.status}`);
    doc.text(`Payment: ${order.paymentMethod}`);
    doc.text(`Date: ${order.createdAt.toDateString()}`);
    doc.end();
    doc.pipe(res);
  } catch (err) {
    res.status(500).json({ message: "❌ Failed to generate invoice" });
  }
};
