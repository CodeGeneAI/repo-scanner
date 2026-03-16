export async function fetchUsers(apiClient: ApiClient, filters: UserFilters) {
  const params = buildQueryParams(filters);
  const response = await apiClient.get("/users", { params });

  if (!response.ok) {
    throw new ServiceError(`Failed to fetch users: ${response.status}`);
  }

  const data = await response.json();
  const users = data.items.map((item: any) => ({
    id: item.id,
    name: item.name,
    email: item.email,
    role: item.role,
    active: item.status === "active",
    createdAt: new Date(item.created_at),
  }));

  return {
    items: users,
    total: data.total,
    page: data.page,
    hasMore: data.page < data.totalPages,
  };
}
