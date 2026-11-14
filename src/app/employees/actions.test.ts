import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEmployee: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getEmployee: mocks.getEmployee }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { updateEmployeeDetails } from "./actions";

const previousUser = {
  id: "c2e6c03a-851b-48f9-993d-0a0c62082f2c",
  email: "old@example.com",
  user_metadata: { display_name: "Old Name", username: "oldname", custom: "preserve" },
};

function formData() {
  const form = new FormData();
  form.set("userId", previousUser.id);
  form.set("username", "newname");
  form.set("displayName", "New Name");
  form.set("contactEmail", "new@example.com");
  form.set("phone", "0771234567");
  form.set("branchId", "9c2d111a-70d1-45a0-bc3c-77b657b00119");
  form.set("reason", "Correct employee details");
  return form;
}

describe("updateEmployeeDetails Auth rollback", () => {
  const updateUserById = vi.fn();
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEmployee.mockResolvedValue({ id: "admin-id", role: "admin" });
    mocks.createAdminClient.mockReturnValue({
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: previousUser }, error: null }), updateUserById } },
    });
    mocks.createClient.mockResolvedValue({ rpc });
    updateUserById.mockResolvedValue({ data: { user: previousUser }, error: null });
    rpc.mockResolvedValue({ error: { code: "23505" } });
  });

  it("restores the prior email and complete user metadata after an RPC failure", async () => {
    const result = await updateEmployeeDetails(formData());

    expect(updateUserById).toHaveBeenNthCalledWith(1, previousUser.id, expect.objectContaining({
      email: "new@example.com",
      user_metadata: { ...previousUser.user_metadata, display_name: "New Name", username: "newname" },
    }));
    expect(updateUserById).toHaveBeenNthCalledWith(2, previousUser.id, {
      email: previousUser.email,
      email_confirm: true,
      user_metadata: previousUser.user_metadata,
    });
    expect(result).toEqual({ error: "That username or email is already in use." });
  });

  it("reports that manual reconciliation is needed when the Auth rollback fails", async () => {
    updateUserById.mockResolvedValueOnce({ data: { user: previousUser }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: { message: "Auth unavailable" } });

    const result = await updateEmployeeDetails(formData());

    expect(result).toEqual({ error: "The database update failed and the Auth rollback also failed. Reconcile this employee account before further changes." });
  });
});
