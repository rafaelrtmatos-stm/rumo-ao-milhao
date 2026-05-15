import { supabaseServer } from "./supabaseServer.js";
import bcrypt from "bcryptjs";

export interface LocalUser {
  id: string;
  email: string;
  password_hash: string;
  is_admin: boolean;
  created_at: string;
}

export const localUsersService = {
  async findByEmail(email: string): Promise<LocalUser | null> {
    const { data, error } = await supabaseServer
      .from("local_users")
      .select("*")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async findById(id: string): Promise<LocalUser | null> {
    const { data, error } = await supabaseServer
      .from("local_users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async listAll(): Promise<Pick<LocalUser, "id" | "email" | "is_admin" | "created_at">[]> {
    const { data, error } = await supabaseServer
      .from("local_users")
      .select("id, email, is_admin, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async count(): Promise<number> {
    const { count, error } = await supabaseServer
      .from("local_users")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  async create(params: { id: string; email: string; password: string; isAdmin: boolean }): Promise<LocalUser> {
    const password_hash = await bcrypt.hash(params.password, 10);
    const { data, error } = await supabaseServer
      .from("local_users")
      .insert({
        id: params.id,
        email: params.email.toLowerCase(),
        password_hash,
        is_admin: params.isAdmin,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async deleteById(id: string): Promise<void> {
    const { error } = await supabaseServer
      .from("local_users")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  async verifyPassword(user: LocalUser, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  },
};
