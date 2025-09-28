export function validate(schema) {
  return (req, res, next) => {
    const data = { body: req.body, params: req.params, query: req.query };
    const result = schema.safeParse(data);
    if (!result.success) {
      return res.status(400).json({
        error: "ValidationError",
        details: result.error.flatten()
      });
    }
    req.body = result.data.body;
    req.params = result.data.params;
    req.query = result.data.query;
    next();
  };
}
