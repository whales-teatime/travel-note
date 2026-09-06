export async function GET() {
  return Response.json({
    mapClientId: process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ?? '',
  });
}
