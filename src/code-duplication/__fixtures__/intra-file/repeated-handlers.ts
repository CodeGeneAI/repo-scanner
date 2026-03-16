import { Router } from "express";

const router = Router();

// Handler 1 - copy-pasted and modified name only
router.get("/users", async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page as string) || 1;
    const limit = Number.parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const items = await db.query("SELECT * FROM users LIMIT ? OFFSET ?", [
      limit,
      offset,
    ]);
    const total = await db.count("users");

    res.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Handler 2 - same exact pattern, different table
router.get("/products", async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page as string) || 1;
    const limit = Number.parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const items = await db.query("SELECT * FROM products LIMIT ? OFFSET ?", [
      limit,
      offset,
    ]);
    const total = await db.count("products");

    res.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Handler 3 - same pattern again
router.get("/orders", async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page as string) || 1;
    const limit = Number.parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const items = await db.query("SELECT * FROM orders LIMIT ? OFFSET ?", [
      limit,
      offset,
    ]);
    const total = await db.count("orders");

    res.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
