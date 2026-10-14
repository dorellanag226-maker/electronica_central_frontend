import {
  changePasswordAuthService,
  loginAuthService,
  logoutAuthService,
  registerAuthService,
} from '../services/authService.js';
import { sendError } from '../utils/sendError.js';

export const registerAuthController = async (req, res) => {
  try {
    return res.status(201).json({ data: await registerAuthService(req.validated.body) });
  } catch (error) {
    return sendError(res, error);
  }
};

export const loginAuthController = async (req, res) => {
  try {
    return res.status(200).json({ data: await loginAuthService(req.validated.body, req.ip) });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getMeAuthController = (req, res) => (
  res.status(200).json({ data: req.auth.usuario })
);

export const logoutAuthController = async (req, res) => {
  try {
    await logoutAuthService(req.auth.token, req.auth.usuario, req.ip);
    return res.status(200).json({ data: { loggedOut: true } });
  } catch (error) {
    return sendError(res, error);
  }
};

export const changePasswordAuthController = async (req, res) => {
  try {
    return res.status(200).json({
      data: await changePasswordAuthService(req.auth, req.validated.body, req.ip),
    });
  } catch (error) {
    return sendError(res, error);
  }
};
