import type { Request, Response } from "express";

export async function handleCreateUser(req: Request, res: Response) {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const existingUser = await db.users.findByEmail(email);
  if (existingUser) {
    return res.status(409).json({ error: "User already exists" });
  }

  const hashedPassword = await hashPassword(password);
  const user = await db.users.create({
    name,
    email,
    password: hashedPassword,
    createdAt: new Date(),
  });

  return res.status(201).json({
    id: user.id,
    name: user.name,
    email: user.email,
  });
}
