// Доступ к панели и ручному запуску — по паролю (заголовок x-pass); расписание ходит с секретом x-run-secret
export const allowed = (req, { run = false } = {}) => {
  const pass = req.headers["x-pass"];
  if (pass && pass === process.env.DASHBOARD_PASSWORD) return true;
  return run && req.headers["x-run-secret"] === process.env.RUN_SECRET;
};
