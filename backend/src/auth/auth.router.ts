import { Router } from "express";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "./auth.utils.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPass = String(password);

    // Look up merchant in Database
    const merchant = await prisma.merchant.findUnique({
      where: { email: cleanEmail },
      include: {
        _count: {
          select: { recoveryCases: true },
        },
      },
    });

    if (!merchant) {
      return res.status(401).json({ error: "No merchant account found with this email" });
    }

    // If passwordHash exists in DB, verify it
    if (merchant.passwordHash) {
      const isValid = verifyPassword(cleanPass, merchant.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid password" });
      }
    } else {
      // If merchant exists but no password hash yet (first login), set it now
      const newHash = hashPassword(cleanPass);
      await prisma.merchant.update({
        where: { id: merchant.id },
        data: { passwordHash: newHash },
      });
    }

    return res.json({
      ok: true,
      user: {
        id: merchant.id,
        email: merchant.email,
        name: merchant.name,
        merchantName: merchant.name,
      },
      message: "Authenticated successfully via database",
    });
  })
);

authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const email = req.query.email ? String(req.query.email).trim().toLowerCase() : null;
    if (!email) {
      return res.status(400).json({ error: "Email parameter required" });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        _count: {
          select: { recoveryCases: true, payments: true, customers: true },
        },
      },
    });

    if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
    }

    return res.json(merchant);
  })
);
