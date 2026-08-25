const jwt = require('jsonwebtoken');

const verifyAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Should contain id and role
        next();
    } catch (err) {
        return res.status(403).json({ message: "Invalid token" });
    }
};

module.exports = verifyAuth;
