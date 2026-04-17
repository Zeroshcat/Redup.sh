package linkpreview

import (
	"context"
	"errors"
	"net"
	"strings"
	"syscall"
	"time"
)

// SSRF is the single chokepoint for deciding whether the fetcher is
// allowed to open a connection to a given resolved address. Every
// link-preview HTTP dial goes through this — including each hop of
// redirect chains, since "safe" public DNS can CNAME to private IPs
// between hops.
var errBlockedTarget = errors.New("link preview: target blocked by ssrf policy")

// allowedNets is an optional allow-list checked BEFORE the block
// rules. Populated from config (LINKPREVIEW_ALLOW_CIDRS). Primary use
// case: dev machines behind a transparent proxy like Clash/Surge that
// returns fake IPs (198.18.0.0/15) for real destinations.
var allowedNets []*net.IPNet

// SetAllowedNets replaces the allow-list. Safe to call once at
// startup from the service constructor; not goroutine-safe against
// live dials, so don't mutate after the first dial runs.
func SetAllowedNets(cidrs []string) {
	list := make([]*net.IPNet, 0, len(cidrs))
	for _, c := range cidrs {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		_, n, err := net.ParseCIDR(c)
		if err != nil {
			continue
		}
		list = append(list, n)
	}
	allowedNets = list
}

func ipAllowed(ip net.IP) bool {
	for _, n := range allowedNets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// isBlockedIP returns true for any address the fetcher must refuse:
// loopback, link-local, private networks, multicast / broadcast, and
// the two well-known cloud metadata addresses. Both IPv4 and IPv6
// ranges are covered.
func isBlockedIP(ip net.IP) bool {
	if ipAllowed(ip) {
		return false
	}
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil {
		// RFC1918
		if ip4[0] == 10 {
			return true
		}
		if ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31 {
			return true
		}
		if ip4[0] == 192 && ip4[1] == 168 {
			return true
		}
		// 100.64.0.0/10 — CGNAT
		if ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
			return true
		}
		// 169.254.0.0/16 — link-local (also caught above, but cheap)
		if ip4[0] == 169 && ip4[1] == 254 {
			return true
		}
		// 192.0.0.0/24 + 192.0.2.0/24 (TEST-NET) + 198.18.0.0/15
		if ip4[0] == 192 && ip4[1] == 0 {
			return true
		}
		if ip4[0] == 198 && (ip4[1] == 18 || ip4[1] == 19) {
			return true
		}
		// 203.0.113.0/24 and 240.0.0.0/4 — reserved / future
		if ip4[0] == 203 && ip4[1] == 0 && ip4[2] == 113 {
			return true
		}
		if ip4[0] >= 240 {
			return true
		}
	} else {
		// IPv6: fc00::/7 unique local, fe80::/10 link-local (also
		// caught above), 2002::/16 6to4 can tunnel into private v4,
		// ::ffff:0:0/96 v4-mapped — unmap and re-check.
		if len(ip) == 16 {
			if ip[0]&0xfe == 0xfc { // fc00::/7
				return true
			}
			if ip[0] == 0x20 && ip[1] == 0x02 { // 2002::/16
				return true
			}
		}
	}
	return false
}

// dialerControl is the net.Dialer.Control hook: it runs after DNS
// resolution has chosen a specific address family and port but before
// connect(2). Refusing here stops the kernel from ever opening the
// socket — strongest point at which to enforce the policy.
func dialerControl(network, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return errBlockedTarget
	}
	if isBlockedIP(ip) {
		return errBlockedTarget
	}
	return nil
}

// newSafeDialer returns a dialer with strict timeouts + the SSRF hook.
// The returned dialer is shared across requests; net.Dialer itself is
// safe for concurrent use.
func newSafeDialer() *net.Dialer {
	return &net.Dialer{
		Timeout:   2 * time.Second,
		KeepAlive: 0,
		Control:   dialerControl,
	}
}

// resolveAndCheck pre-flights a host: resolves it and rejects the
// attempt if any returned address is blocked. Run before dial so we
// fail with a clear error rather than a generic "dial tcp …" string,
// which the handler surfaces to admins who're debugging a block.
func resolveAndCheck(ctx context.Context, host string) error {
	resolver := &net.Resolver{PreferGo: true}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	ips, err := resolver.LookupIPAddr(ctx, host)
	if err != nil {
		return err
	}
	if len(ips) == 0 {
		return errBlockedTarget
	}
	for _, ip := range ips {
		if isBlockedIP(ip.IP) {
			return errBlockedTarget
		}
	}
	return nil
}
