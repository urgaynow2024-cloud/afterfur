# Vercel Platform-Level Security Investigation

Date: 2026-10-30  
Website: https://www.afterfur.site/

## Executive Summary
Our application-level security headers (next.config.ts, middleware.ts, vercel.json) are not being applied in production. The wildcard CORS header and public cache headers are being added at the Vercel/platform level.

## 1. Vercel Configuration Analysis

### Evidence from Headers
All responses show:
- Server: Vercel - Confirmed Vercel hosting
- X-Vercel-Cache: HIT / PRERENDER - Vercel CDN/edge caching
- X-Vercel-Id present - Vercel infrastructure
- Access-Control-Allow-Origin: * on ALL responses (pages, OPTIONS, 404s, assets)
- Cache-Control: public, max-age=0, must-revalidate on ALL responses

### Why Headers Aren't Applied
Possible causes:
1. **vercel.json conflicts** - We added vercel.json with headers, but Vercel might be overriding or the format might not be applied correctly
2. **Next.js config in production** - next.config.ts headers() might not be working as expected with the current setup
3. **Middleware not executing** - Middleware might not be running in the deployed environment
4. **Vercel has global headers configured** - Project-level or team-level headers set in Vercel dashboard take precedence
5. **CDN/Edge overrides** - Vercel's edge network may be adding headers

### vercel.json Format Check
Our vercel.json:
`json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [...]
    }
  ]
}
`
This is correct format, but Vercel may ignore it if other configurations take precedence.

## 2. Wildcard CORS Investigation

**Origin:** Platform-level (Vercel/CDN), not from application code
- Present on HTML pages, OPTIONS requests, API routes (404), static assets
- No CORS configuration found in our Next.js app code
- Appears on every response

**Impact:**
- Affects ALL routes including sensitive authenticated pages (/settings, /messages)
- Public static assets may need CORS for cross-origin loading (fonts, etc.) - but wildcard is overly permissive
- For credentialed requests, browsers block wildcard anyway, but it's still a security concern
- OPTIONS preflight returns wildcard

**Legitimate use case:** Fonts loaded from different origins might need CORS, but Access-Control-Allow-Origin: * is very broad.

## 3. Caching Investigation

**Current state:** Everything is cached publicly by Vercel CDN
- Sensitive pages (/settings, /messages) return public cache headers
- Our middleware tries to set private, no-store but isn't working
- X-Vercel-Cache: HIT indicates CDN serving cached responses

**Issues:**
- Vercel's caching behavior may override application cache headers
- With Next.js App Router and static/prerendered pages, caching is complex
- Public caching of sensitive pages is dangerous

## 4. Remediation Plan

### Issue 1: Security Headers Not Applied
**Root cause:** Unknown - could be Vercel config override, middleware not running, or headers() not working

**Recommended fixes:**
1. **Check Vercel dashboard** - Look for Project Settings > Headers, Edge Config, or any custom headers
2. **Use vercel.json more explicitly** - Ensure it's in root and properly formatted
3. **Try different header placement** - Maybe in next.config.ts with different config
4. **Consider using Vercel's edge middleware differently**
5. **Check if function regions affect headers**

**Requires:** Vercel dashboard access  
**Code changes:** Possibly  
**Redeployment:** Yes  
**Verification:** Check headers after changes

### Issue 2: Wildcard CORS
**Root cause:** Likely Vercel platform setting or default behavior

**Recommended fixes:**
1. **Vercel dashboard** - Check if there's CORS configuration
2. **Remove/restrict** - Only allow necessary origins
3. **For public assets** - May need to keep for some resources, but restrict for others
4. **Consider Supabase** - Check if Supabase is adding CORS headers

**Requires:** Vercel dashboard access (critical)  
**Code changes:** Maybe not possible if platform-level  
**Redeployment:** Maybe  
**Verification:** Test with different origins

### Issue 3: Public Caching of Sensitive Pages
**Root cause:** Vercel CDN caching everything as public

**Recommended fixes:**
1. **Use proper Cache-Control** - Must be set correctly and not overridden
2. **Mark routes as dynamic** - Use export const dynamic = 'force-dynamic' for sensitive pages
3. **Use export const revalidate = 0** - Prevent caching
4. **Vercel-specific** - May need to configure in vercel.json or dashboard

**Requires:** Code changes + possibly dashboard access  
**Code changes:** Yes - add dynamic exports to sensitive pages  
**Redeployment:** Yes  
**Verification:** Check cache headers and X-Vercel-Cache

## Immediate Actions Needed
1. **Access Vercel dashboard** to check project settings, headers, and any overrides
2. **Add export const dynamic = 'force-dynamic' to sensitive pages** (/settings, /messages, /notifications, /bookmarks, /staff, /account-security)
3. **Test if headers come from our config** by temporarily changing them and redeploying
4. **Check Vercel logs** for middleware execution

**Note:** I cannot access Vercel dashboard or change platform settings. These require account access.
