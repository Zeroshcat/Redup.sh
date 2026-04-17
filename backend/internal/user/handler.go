package user

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/redup/backend/internal/audit"
	"github.com/redup/backend/internal/auth"
	httpx "github.com/redup/backend/internal/http"
)

// LevelComputer turns a stored XP value into the user-facing level. Wired by
// main.go from the credits service so the curve stays in one place.
type LevelComputer interface {
	LevelForXP(xp int) int
}

type Handler struct {
	svc           *Service
	jwt           *auth.JWTManager
	audit         *audit.Service
	levelComputer LevelComputer
}

func NewHandler(svc *Service, jwt *auth.JWTManager) *Handler {
	return &Handler{svc: svc, jwt: jwt}
}

func (h *Handler) SetAudit(a *audit.Service)              { h.audit = a }
func (h *Handler) SetLevelComputer(c LevelComputer)       { h.levelComputer = c }

func (h *Handler) record(c *gin.Context, in audit.Input) {
	if h.audit != nil {
		h.audit.Record(c, in)
	}
}

// Register mounts user routes. The optional authMiddleware is applied to
// the /auth/register and /auth/login endpoints specifically so main.go
// can attach rate limiting without also throttling /refresh and
// /logout (which have their own semantics). Pass nil to skip.
func (h *Handler) Register(r *gin.RouterGroup, authMiddleware ...gin.HandlerFunc) {
	g := r.Group("/auth")
	// /register and /login get the extra middleware layer (rate limit);
	// /refresh and /logout are attached to the bare group so they aren't
	// double-charged against the same bucket as login attempts.
	entry := r.Group("/auth")
	for _, mw := range authMiddleware {
		if mw != nil {
			entry.Use(mw)
		}
	}
	entry.POST("/register", h.register)
	entry.POST("/login", h.login)
	entry.POST("/send-verification", h.sendVerification)
	entry.POST("/verify-email", h.verifyEmail)
	entry.POST("/forgot-password", h.forgotPassword)
	entry.POST("/reset-password", h.resetPassword)
	g.POST("/refresh", h.refresh)
	g.POST("/logout", h.logout)

	// Public: anyone can view a user's public profile.
	r.GET("/users/:username", h.publicProfile)

	// Authenticated: current user info + self-service mutations.
	me := r.Group("/users")
	me.Use(auth.RequireAuth(h.jwt))
	me.GET("/me", h.me)
	me.PUT("/me", h.updateMe)
	me.POST("/me/password", h.changePassword)
	me.POST("/me/email/request", h.requestEmailChange)
	me.POST("/me/email/confirm", h.confirmEmailChange)
}

// RegisterAdmin mounts admin user-moderation endpoints. Caller is expected to
// apply auth + admin rbac middleware before calling this.
func (h *Handler) RegisterAdmin(r *gin.RouterGroup) {
	r.GET("/users", h.adminList)
	r.POST("/users/:id/ban", h.adminBan)
	r.POST("/users/:id/unban", h.adminUnban)
	r.POST("/users/:id/credit-score", h.adminAdjustCreditScore)
}

type adjustCreditScoreReq struct {
	Delta  int    `json:"delta"`
	Reason string `json:"reason"`
}

func (h *Handler) adminAdjustCreditScore(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	var body adjustCreditScoreReq
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	if body.Delta == 0 {
		httpx.ValidationError(c, "invalid_delta", "delta must be non-zero")
		return
	}
	u, newScore, err := h.svc.AdjustCreditScore(id, body.Delta)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			httpx.NotFound(c, "user not found")
			return
		}
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, audit.Input{
		Action:      "user.credit_score_adjust",
		TargetType:  "user",
		TargetID:    u.ID,
		TargetLabel: "@" + u.Username,
		Detail:      fmt.Sprintf("delta=%d new=%d reason=%s", body.Delta, newScore, body.Reason),
	})
	httpx.OK(c, gin.H{
		"user_id":      u.ID,
		"credit_score": newScore,
	})
}

type AdminUserListResp struct {
	Items []PublicUser `json:"items"`
	Total int64        `json:"total"`
}

func (h *Handler) adminList(c *gin.Context) {
	opts := ListOptions{
		Search: c.Query("search"),
		Role:   c.Query("role"),
		Status: c.Query("status"),
		Limit:  atoiOrDefault(c.Query("limit"), 50),
		Offset: atoiOrDefault(c.Query("offset"), 0),
	}
	items, total, err := h.svc.List(opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	out := make([]PublicUser, 0, len(items))
	for i := range items {
		p := h.toPublic(&items[i])
		p.Status = items[i].Status
		out = append(out, p)
	}
	httpx.OK(c, AdminUserListResp{Items: out, Total: total})
}

func atoiOrDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}

func (h *Handler) adminBan(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	u, err := h.svc.Ban(id)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			httpx.NotFound(c, "user not found")
			return
		}
		if errors.Is(err, ErrAccountDisabled) {
			httpx.Fail(c, 403, "cannot_ban_admin", "admin users cannot be banned via this endpoint")
			return
		}
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, audit.Input{
		Action:      "user.ban",
		TargetType:  "user",
		TargetID:    u.ID,
		TargetLabel: "@" + u.Username,
	})
	httpx.OK(c, h.toPublic(u))
}

func (h *Handler) adminUnban(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.BadRequest(c, "invalid id")
		return
	}
	u, err := h.svc.Unban(id)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			httpx.NotFound(c, "user not found")
			return
		}
		httpx.Internal(c, err.Error())
		return
	}
	h.record(c, audit.Input{
		Action:      "user.unban",
		TargetType:  "user",
		TargetID:    u.ID,
		TargetLabel: "@" + u.Username,
	})
	httpx.OK(c, h.toPublic(u))
}

type PublicUser struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	AvatarURL   string `json:"avatar_url,omitempty"`
	Bio         string `json:"bio,omitempty"`
	Location    string `json:"location,omitempty"`
	Website     string `json:"website,omitempty"`
	Level       int    `json:"level"`
	XP          int    `json:"xp"`
	Role        string `json:"role"`
	Status      string `json:"status,omitempty"`
	CreditScore int    `json:"credit_score"`
	JoinedAt    string `json:"joined_at"`
}

func (h *Handler) toPublic(u *User) PublicUser {
	level := int(u.Level)
	if h.levelComputer != nil {
		level = h.levelComputer.LevelForXP(u.XP)
	}
	return PublicUser{
		ID:          u.ID,
		Username:    u.Username,
		AvatarURL:   u.AvatarURL,
		Bio:         u.Bio,
		Location:    u.Location,
		Website:     u.Website,
		Level:       level,
		XP:          u.XP,
		Role:        u.Role,
		CreditScore: u.CreditScore,
		JoinedAt:    u.JoinedAt.Format("2006-01-02T15:04:05Z"),
	}
}

func (h *Handler) publicProfile(c *gin.Context) {
	u, err := h.svc.GetByUsername(c.Param("username"))
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			httpx.NotFound(c, "user not found")
			return
		}
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, h.toPublic(u))
}

type registerReq struct {
	Username   string `json:"username" binding:"required"`
	Email      string `json:"email" binding:"required"`
	Password   string `json:"password" binding:"required"`
	InviteCode string `json:"invite_code"`
}

type authResp struct {
	User                *User  `json:"user"`
	AccessToken         string `json:"access_token"`
	RefreshToken        string `json:"refresh_token"`
	ExpiresIn           int    `json:"expires_in"`
	EmailVerifyRequired bool   `json:"email_verify_required,omitempty"`
}

func (h *Handler) register(c *gin.Context) {
	var req registerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	u, err := h.svc.Register(RegisterInput{
		Username:   req.Username,
		Email:      req.Email,
		Password:   req.Password,
		InviteCode: req.InviteCode,
	})
	if err != nil {
		h.writeServiceError(c, err)
		return
	}
	h.issueTokens(c, u, true)
}

type loginReq struct {
	Login    string `json:"login" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *Handler) login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	u, err := h.svc.Login(LoginInput{Login: req.Login, Password: req.Password})
	if err != nil {
		if errors.Is(err, ErrEmailNotVerified) && u != nil {
			// Attach the email so the UI can jump straight to the
			// verify-code page without asking for it again.
			httpx.FailWith(c, 403, httpx.CodeEmailNotVerified,
				"email not verified", gin.H{"email": u.Email})
			return
		}
		h.writeServiceError(c, err)
		return
	}
	h.issueTokens(c, u, false)
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func (h *Handler) refresh(c *gin.Context) {
	var req refreshReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	claims, err := h.jwt.ParseRefresh(req.RefreshToken)
	if err != nil {
		httpx.Fail(c, 401, httpx.CodeTokenInvalid, "invalid refresh token")
		return
	}
	u, err := h.svc.GetByID(claims.UserID)
	if err != nil {
		httpx.NotFound(c, "user not found")
		return
	}
	h.issueTokens(c, u, false)
}

// logout revokes both the access token carried in the Authorization
// header and (optionally) the refresh token sent in the body. Clients
// should POST their refresh_token so a stolen refresh can't be used to
// mint a new access pair after the user clicks "sign out everywhere".
func (h *Handler) logout(c *gin.Context) {
	// Access token — parse from the Authorization header. Failures are
	// silent so a double-logout (no header on second call) still returns
	// 204 rather than leaking information.
	if header := c.GetHeader("Authorization"); header != "" {
		parts := strings.SplitN(header, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
			if claims, err := h.jwt.ParseAccess(parts[1]); err == nil {
				h.jwt.Revoke(claims)
			}
		}
	}
	// Refresh token — optional body field. Same silent-failure semantics.
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = c.ShouldBindJSON(&body)
	if body.RefreshToken != "" {
		if claims, err := h.jwt.ParseRefresh(body.RefreshToken); err == nil {
			h.jwt.Revoke(claims)
		}
	}
	httpx.NoContent(c)
}

func (h *Handler) me(c *gin.Context) {
	id, ok := auth.CurrentUserID(c)
	if !ok {
		httpx.Unauthorized(c, "unauthorized")
		return
	}
	u, err := h.svc.GetByID(id)
	if err != nil {
		httpx.NotFound(c, "user not found")
		return
	}
	httpx.OK(c, u)
}

// updateMeReq is the wire shape for self-service profile updates. Note
// that username, email, role, status, credits, and xp are NOT exposed
// here — those go through admin endpoints or dedicated flows.
type updateMeReq struct {
	AvatarURL string `json:"avatar_url"`
	Bio       string `json:"bio"`
	Location  string `json:"location"`
	Website   string `json:"website"`
}

func (h *Handler) updateMe(c *gin.Context) {
	id, ok := auth.CurrentUserID(c)
	if !ok {
		httpx.Unauthorized(c, "unauthorized")
		return
	}
	var req updateMeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	u, err := h.svc.UpdateProfile(id, UpdateProfileInput{
		AvatarURL: req.AvatarURL,
		Bio:       req.Bio,
		Location:  req.Location,
		Website:   req.Website,
	})
	if err != nil {
		if errors.Is(err, ErrInvalidProfile) {
			httpx.ValidationError(c, "invalid_profile", "profile field too long or malformed")
			return
		}
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, u)
}

type changePasswordReq struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

func (h *Handler) changePassword(c *gin.Context) {
	id, ok := auth.CurrentUserID(c)
	if !ok {
		httpx.Unauthorized(c, "unauthorized")
		return
	}
	var req changePasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	if err := h.svc.ChangePassword(id, req.OldPassword, req.NewPassword); err != nil {
		switch {
		case errors.Is(err, ErrInvalidCredential):
			httpx.Fail(c, 401, httpx.CodeInvalidCredential, "current password is incorrect")
		case errors.Is(err, ErrWeakPassword):
			httpx.ValidationError(c, httpx.CodeWeakPassword, "new password must be at least 8 characters")
		default:
			httpx.Internal(c, err.Error())
		}
		return
	}
	httpx.NoContent(c)
}

func (h *Handler) issueTokens(c *gin.Context, u *User, created bool) {
	access, refresh, err := h.jwt.IssuePair(u.ID, u.Role)
	if err != nil {
		httpx.Internal(c, "failed to issue token")
		return
	}
	resp := authResp{
		User:                u,
		AccessToken:         access,
		RefreshToken:        refresh,
		ExpiresIn:           h.jwt.AccessTTLSeconds(),
		EmailVerifyRequired: h.svc.VerifyRequiredAndMissing(u),
	}
	if created {
		httpx.Created(c, resp)
	} else {
		httpx.OK(c, resp)
	}
}

type sendVerifyReq struct {
	Email string `json:"email" binding:"required"`
}

// sendVerification (re)sends the email verification code for a given
// address. Deliberately opaque about whether the email is registered:
// callers always see a generic success unless the mailer is
// mis-configured or cooldown tripped. This prevents an address-enum
// oracle via this endpoint.
func (h *Handler) sendVerification(c *gin.Context) {
	var req sendVerifyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	err := h.svc.SendVerificationEmail(c.Request.Context(), req.Email)
	switch {
	case err == nil:
		httpx.OK(c, gin.H{"ok": true})
	case errors.Is(err, ErrMailNotConfigured), errors.Is(err, ErrVerifyCodeStoreMissing):
		httpx.Fail(c, 503, httpx.CodeMailNotConfigured, "mail service not configured")
	case errors.Is(err, ErrResendTooSoon):
		httpx.Fail(c, 429, httpx.CodeResendTooSoon, "please wait before requesting another code")
	case errors.Is(err, ErrEmailAlreadyVerified):
		httpx.Fail(c, 409, httpx.CodeEmailAlreadyVerified, "email already verified")
	case errors.Is(err, ErrInvalidEmail):
		httpx.ValidationError(c, httpx.CodeInvalidEmail, "invalid email format")
	case errors.Is(err, ErrUserNotFound):
		// Don't leak registration state — respond as if success.
		httpx.OK(c, gin.H{"ok": true})
	default:
		httpx.Internal(c, err.Error())
	}
}

type verifyEmailReq struct {
	Email string `json:"email" binding:"required"`
	Code  string `json:"code" binding:"required"`
}

// verifyEmail redeems a code and stamps email_verified_at. Returns the
// updated user so the client can swap its cached copy. Crucially it
// does NOT issue new tokens — the caller already has a session from
// register/login (we don't block either on verification). A signed-in
// session with verified email is the canonical post-verify state.
func (h *Handler) verifyEmail(c *gin.Context) {
	var req verifyEmailReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	u, err := h.svc.VerifyEmailCode(req.Email, req.Code)
	switch {
	case err == nil:
		httpx.OK(c, gin.H{"user": u, "verified": true})
	case errors.Is(err, ErrInvalidCode):
		httpx.ValidationError(c, httpx.CodeInvalidVerifyCode, "invalid or expired verification code")
	case errors.Is(err, ErrVerifyCodeStoreMissing):
		httpx.Fail(c, 503, httpx.CodeMailNotConfigured, "verification store not configured")
	default:
		httpx.Internal(c, err.Error())
	}
}

type emailChangeReq struct {
	NewEmail string `json:"new_email" binding:"required"`
}

func (h *Handler) requestEmailChange(c *gin.Context) {
	uid, ok := auth.CurrentUserID(c)
	if !ok {
		httpx.Unauthorized(c, "unauthorized")
		return
	}
	var req emailChangeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	err := h.svc.RequestEmailChange(c.Request.Context(), uid, req.NewEmail)
	switch {
	case err == nil:
		httpx.OK(c, gin.H{"ok": true})
	case errors.Is(err, ErrMailNotConfigured), errors.Is(err, ErrVerifyCodeStoreMissing):
		httpx.Fail(c, 503, httpx.CodeMailNotConfigured, "mail service not configured")
	case errors.Is(err, ErrResendTooSoon):
		httpx.Fail(c, 429, httpx.CodeResendTooSoon, "please wait before requesting another code")
	case errors.Is(err, ErrEmailAlreadyVerified):
		httpx.Conflict(c, httpx.CodeEmailAlreadyVerified, "new email matches the current one")
	case errors.Is(err, ErrEmailTaken):
		httpx.Conflict(c, httpx.CodeEmailTaken, "email already taken")
	case errors.Is(err, ErrInvalidEmail):
		httpx.ValidationError(c, httpx.CodeInvalidEmail, "invalid email format")
	case errors.Is(err, ErrEmailDomainBlocked):
		httpx.ValidationError(c, "email_domain_blocked", "this email domain is not allowed")
	default:
		httpx.Internal(c, err.Error())
	}
}

type emailConfirmReq struct {
	NewEmail string `json:"new_email" binding:"required"`
	Code     string `json:"code" binding:"required"`
}

func (h *Handler) confirmEmailChange(c *gin.Context) {
	uid, ok := auth.CurrentUserID(c)
	if !ok {
		httpx.Unauthorized(c, "unauthorized")
		return
	}
	var req emailConfirmReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	u, err := h.svc.ConfirmEmailChange(uid, req.NewEmail, req.Code)
	switch {
	case err == nil:
		httpx.OK(c, u)
	case errors.Is(err, ErrInvalidCode):
		httpx.ValidationError(c, httpx.CodeInvalidVerifyCode, "invalid or expired verification code")
	case errors.Is(err, ErrEmailTaken):
		httpx.Conflict(c, httpx.CodeEmailTaken, "email already taken")
	case errors.Is(err, ErrVerifyCodeStoreMissing):
		httpx.Fail(c, 503, httpx.CodeMailNotConfigured, "verification store not configured")
	default:
		httpx.Internal(c, err.Error())
	}
}

type forgotPasswordReq struct {
	Email string `json:"email" binding:"required"`
}

// forgotPassword fires a reset-password email when the address exists.
// Always returns 200 for unknown addresses to avoid leaking
// registration state. Real failures (SMTP down, cooldown) also
// collapse to 200 for the same reason — the UI shows the same
// "if the address exists, we've sent a mail" message either way.
func (h *Handler) forgotPassword(c *gin.Context) {
	var req forgotPasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	err := h.svc.RequestPasswordReset(c.Request.Context(), req.Email)
	switch {
	case err == nil, errors.Is(err, ErrUserNotFound), errors.Is(err, ErrResetCooldown):
		httpx.OK(c, gin.H{"ok": true})
	case errors.Is(err, ErrMailNotConfigured), errors.Is(err, ErrResetStoreMissing):
		httpx.Fail(c, 503, httpx.CodeMailNotConfigured, "mail service not configured")
	case errors.Is(err, ErrInvalidEmail):
		httpx.ValidationError(c, httpx.CodeInvalidEmail, "invalid email format")
	default:
		httpx.Internal(c, err.Error())
	}
}

type resetPasswordReq struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

// resetPassword redeems a reset token and writes the new bcrypt hash.
// Invalid / expired / already-used tokens collapse to the same
// reset_token_invalid code so an attacker can't probe token state.
func (h *Handler) resetPassword(c *gin.Context) {
	var req resetPasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid request")
		return
	}
	err := h.svc.ResetPassword(req.Token, req.NewPassword)
	switch {
	case err == nil:
		httpx.NoContent(c)
	case errors.Is(err, ErrResetTokenInvalid):
		httpx.ValidationError(c, httpx.CodeResetTokenInvalid, "reset token is invalid or expired")
	case errors.Is(err, ErrWeakPassword):
		httpx.ValidationError(c, httpx.CodeWeakPassword, "new password must be at least 8 characters")
	case errors.Is(err, ErrResetStoreMissing):
		httpx.Fail(c, 503, httpx.CodeMailNotConfigured, "reset store not configured")
	default:
		httpx.Internal(c, err.Error())
	}
}

// writeServiceError maps domain errors to HTTP responses with stable codes.
func (h *Handler) writeServiceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrUsernameTaken):
		httpx.Conflict(c, httpx.CodeUsernameTaken, "username already taken")
	case errors.Is(err, ErrEmailTaken):
		httpx.Conflict(c, httpx.CodeEmailTaken, "email already taken")
	case errors.Is(err, ErrInvalidUsername):
		httpx.ValidationError(c, httpx.CodeInvalidUsername, "username must be 3-32 chars, start with a letter")
	case errors.Is(err, ErrInvalidEmail):
		httpx.ValidationError(c, httpx.CodeInvalidEmail, "invalid email format")
	case errors.Is(err, ErrWeakPassword):
		httpx.ValidationError(c, httpx.CodeWeakPassword, "password must be at least 8 characters")
	case errors.Is(err, ErrInvalidCredential):
		httpx.Fail(c, 401, httpx.CodeInvalidCredential, "invalid username or password")
	case errors.Is(err, ErrAccountLocked):
		httpx.Fail(c, 429, httpx.CodeRateLimited, "账号暂时被锁定，请稍后重试")
	case errors.Is(err, ErrAccountDisabled):
		httpx.Fail(c, 403, httpx.CodeAccountDisabled, "account is disabled")
	case errors.Is(err, ErrRegistrationClosed):
		httpx.Fail(c, 403, "registration_closed", "registration is currently closed")
	case errors.Is(err, ErrInviteRequired):
		httpx.Fail(c, 403, "invite_required", "an invite code is required to register")
	case errors.Is(err, ErrInvalidInviteCode):
		httpx.ValidationError(c, "invalid_invite_code", "invite code is invalid, expired, or fully used")
	case errors.Is(err, ErrEmailDomainBlocked):
		httpx.ValidationError(c, "email_domain_blocked", "this email domain is not allowed")
	default:
		httpx.Internal(c, "internal server error")
	}
}
