// src/pages/api/login.ts
import type { APIContext } from "astro";
import { ADMIN_USER } from "@/config";
import { signJwt } from "@/lib/auth";

export async function POST({ request }: APIContext): Promise<Response> {
  try {
    const { nickname, email, password } = await request.json();

    const secretPassword = import.meta.env.SECRET_ADMIN_PASSWORD;

    // 如果填了密码，则尝试验证管理员身份
    if (password && secretPassword && password === secretPassword) {
      // 密码正确，生成JWT
      const adminPayload = {
        nickname: nickname || ADMIN_USER.nickname,
        email: email || ADMIN_USER.email,
        website: ADMIN_USER.website,
        avatar: ADMIN_USER.avatar,
        isAdmin: true,
      };
      const token = signJwt(adminPayload);

      // 强制手动设置 Set-Cookie，确保兼容性
      const cookieOptions = [
        `auth_token=${token}`,
        "HttpOnly",
        "Path=/",
        "Max-Age=2592000",
        "SameSite=Lax",
      ];

      // 只有在确定是正式域名且非本地测试时才加 Secure
      if (import.meta.env.PROD) {
        cookieOptions.push("Secure");
      }

      return new Response(
        JSON.stringify({
          success: true,
          isAdmin: true,
          message: "管理员验证成功",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": cookieOptions.join("; "),
          },
        },
      );
    }

    // 普通访客登录逻辑 (未填密码或密码错误但不是强制要求的用户)
    // 这里我们可以根据需要决定是否对特定账号强制要求密码，
    // 但为了简单起见，只要密码不对就当成普通用户（除非您想禁用某些昵称）
    return new Response(JSON.stringify({ success: true, isAdmin: false }), {
      status: 200,
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ success: false, message: "无效的请求" }),
      { status: 400 },
    );
  }
}
