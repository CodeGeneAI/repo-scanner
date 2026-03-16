export async function fetchProducts(
  httpClient: HttpClient,
  options: ProductQuery,
) {
  const queryParams = buildQueryParams(options);
  const result = await httpClient.get("/products", { params: queryParams });

  if (!result.ok) {
    throw new ServiceError(`Failed to fetch products: ${result.status}`);
  }

  const body = await result.json();
  const products = body.items.map((record: any) => ({
    id: record.id,
    name: record.name,
    email: record.email,
    role: record.role,
    active: record.status === "active",
    createdAt: new Date(record.created_at),
  }));

  return {
    items: products,
    total: body.total,
    page: body.page,
    hasMore: body.page < body.totalPages,
  };
}
