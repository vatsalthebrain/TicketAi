import express from "express";
import {
  getUsers,
  login,
  signup,
  updateUser,
  logout,
  deleteUser,
} from "../controllers/user.js";

import { authenticate } from "../middlewares/auth.js";
const router = express.Router();

router.post("/update-user", authenticate, updateUser);
router.get("/users", authenticate, getUsers);
router.delete("/users/:id", authenticate, deleteUser);

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);

export default router;
