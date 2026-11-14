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
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
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

describe("updateEmployeeDetails Auth consistency", () => {
  const updateUserById = vi.fn();
  const getUserById = vi.fn();
  const rpc = vi.fn();
  let authUser: typeof previousUser;

  beforeEach(() => {
    vi.clearAllMocks();
    authUser = structuredClone(previousUser);
    mocks.getEmployee.mockResolvedValue({ id: "admin-id", role: "admin" });
    getUserById.mockImplementation(async () => ({ data: { user: structuredClone(authUser) }, error: null }));
    updateUserById.mockImplementation(async (_id, update) => {
      authUser = {
        ...authUser,
        ...("email" in update ? { email: update.email } : {}),
        ...("user_metadata" in update ? { user_metadata: update.user_metadata } : {}),
      };
      return { data: { user: authUser }, error: null };
    });
    mocks.createAdminClient.mockReturnValue({ auth: { admin: { getUserById, updateUserById } } });
    mocks.createClient.mockResolvedValue({ rpc });
    rpc.mockResolvedValue({ error: null });
  });

  it("returns success when the database update succeeds", async () => {
    const result = await updateEmployeeDetails(formData());

    expect(result).toEqual({ success: "Account details updated." });
    expect(rpc).toHaveBeenCalledOnce();
    expect(updateUserById).toHaveBeenCalledOnce();
  });

  it("compensates after a returned RPC error", async () => {
    rpc.mockResolvedValue({ error: { code: "23505" } });

    const result = await updateEmployeeDetails(formData());

    expect(updateUserById).toHaveBeenCalledTimes(2);
    expect(updateUserById.mock.calls[1][1]).toEqual({
      email: previousUser.email,
      email_confirm: true,
      user_metadata: previousUser.user_metadata,
    });
    expect(result).toEqual({ error: "That username or email is already in use." });
  });

  it("attempts guarded compensation when the RPC throws", async () => {
    rpc.mockRejectedValue(new Error("transport detail must not be returned"));

    const result = await updateEmployeeDetails(formData());

    expect(updateUserById).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ error: "The database request outcome is uncertain. Auth compensation was attempted; verify both account records before retrying." });
  });

  it("returns a reconciliation-required error when rollback fails", async () => {
    rpc.mockResolvedValue({ error: { code: "XX000", message: "private database detail" } });
    updateUserById.mockImplementationOnce(async (_id, update) => {
      authUser = { ...authUser, email: update.email, user_metadata: update.user_metadata };
      return { data: { user: authUser }, error: null };
    }).mockResolvedValueOnce({ data: { user: null }, error: { message: "private Auth detail" } });

    const result = await updateEmployeeDetails(formData());

    expect(result?.error).toContain("The database rejected the employee update");
    expect(result?.error).toContain("Reconciliation is required.");
    expect(result?.error).not.toContain("private");
  });

  it("preserves newer unrelated metadata while restoring the fields this action changed", async () => {
    rpc.mockResolvedValue({ error: { code: "XX000" } });
    updateUserById.mockImplementationOnce(async (_id, update) => {
      authUser = {
        ...authUser,
        email: update.email,
        user_metadata: { ...update.user_metadata, concurrent_note: "newer value" },
      };
      return { data: { user: authUser }, error: null };
    });

    await updateEmployeeDetails(formData());

    expect(updateUserById.mock.calls[1][1].user_metadata).toEqual({
      ...previousUser.user_metadata,
      concurrent_note: "newer value",
    });
  });

  it("does not overwrite concurrently changed fields owned by another update", async () => {
    rpc.mockResolvedValue({ error: { code: "XX000" } });
    updateUserById.mockImplementationOnce(async (_id, update) => {
      authUser = { ...authUser, email: update.email, user_metadata: { ...update.user_metadata, display_name: "Concurrent Name" } };
      return { data: { user: authUser }, error: null };
    });

    const result = await updateEmployeeDetails(formData());

    expect(updateUserById).toHaveBeenCalledOnce();
    expect(result?.error).toContain("Reconciliation is required.");
    expect(authUser.user_metadata.display_name).toBe("Concurrent Name");
  });

  it("does not call the database when the Auth update fails before applying", async () => {
    updateUserById.mockRejectedValueOnce(new Error("transport failure"));

    const result = await updateEmployeeDetails(formData());

    expect(rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "Could not update the account email. It may already be in use." });
  });
});
