export async function GET() {
  return Response.json({
    mapClientId: process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ?? '',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
  });
}
