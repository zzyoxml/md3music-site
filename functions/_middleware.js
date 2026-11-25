export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'musicplayer.ccwu.cc') {
    return Response.redirect('https://md3music.ccwu.cc' + url.pathname + url.search, 301);
  }
  return context.next();
}
