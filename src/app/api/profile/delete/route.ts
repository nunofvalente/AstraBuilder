import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function DELETE(request: Request) {
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Account deletion is not configured", { supabaseUrlConfigured: !!supabaseUrl, serviceRoleKeyConfigured: !!serviceRoleKey });
    return NextResponse.json(
      { message: "Account deletion is not available right now." },
      { status: 500 }
    );
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (!accessToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const { data: userResult, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !userResult?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = userResult.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      console.error("Failed to delete profile for user", userId, profileError);
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Failed to delete auth user", userId, deleteError);
      return NextResponse.json(
        { message: "We couldn't delete your account. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error deleting account", error);
    return NextResponse.json(
      { message: "We couldn't delete your account. Please try again." },
      { status: 500 }
    );
  }
}


