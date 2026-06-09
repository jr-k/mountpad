package acl

import (
	"errors"
	"fmt"

	"github.com/mountpad/mountpad/internal/models"
)

// Permission bits (Linux-style).
const (
	OthersX uint16 = 1 << iota
	OthersW
	OthersR
	GroupX
	GroupW
	GroupR
	UserX
	UserW
	UserR
)

// Mode helpers operate on uint16 octal modes.
func ParseMode(s string) (uint16, error) {
	if len(s) != 9 {
		return 0, fmt.Errorf("invalid mode %q", s)
	}
	var m uint16
	mapping := []struct {
		idx  int
		bit  uint16
		want byte
	}{
		{0, UserR, 'r'}, {1, UserW, 'w'}, {2, UserX, 'x'},
		{3, GroupR, 'r'}, {4, GroupW, 'w'}, {5, GroupX, 'x'},
		{6, OthersR, 'r'}, {7, OthersW, 'w'}, {8, OthersX, 'x'},
	}
	for _, e := range mapping {
		switch s[e.idx] {
		case e.want:
			m |= e.bit
		case '-':
		default:
			return 0, fmt.Errorf("invalid mode char at %d: %q", e.idx, s[e.idx])
		}
	}
	return m, nil
}

func FormatMode(m uint16) string {
	out := []byte("---------")
	if m&UserR != 0 { out[0] = 'r' }
	if m&UserW != 0 { out[1] = 'w' }
	if m&UserX != 0 { out[2] = 'x' }
	if m&GroupR != 0 { out[3] = 'r' }
	if m&GroupW != 0 { out[4] = 'w' }
	if m&GroupX != 0 { out[5] = 'x' }
	if m&OthersR != 0 { out[6] = 'r' }
	if m&OthersW != 0 { out[7] = 'w' }
	if m&OthersX != 0 { out[8] = 'x' }
	return string(out)
}

// Action enumerates every permission check the system performs.
type Action int

const (
	ActionList Action = iota
	ActionTraverse
	ActionRead
	ActionWrite
	ActionCreate
	ActionDelete
	ActionChmod
	ActionChown
)

// ErrDenied is returned when the user is not authorised. It is the only
// permission-error value the handler layer should ever surface (mapped to 403).
var ErrDenied = errors.New("permission denied")

// EffectiveBits computes the visible permission bits for the requesting user
// against a {owner, group, mode} tuple, projecting them into the User triplet
// (bits 6..8) so HasRead/HasWrite/HasExec — which only inspect User bits —
// give the right answer regardless of which class (owner/group/others)
// actually granted the permission.
//
// Bit layout in `mode` (see the iota above):
//
//	bit  8  7  6   5  4  3   2  1  0
//	     U  U  U   G  G  G   O  O  O
//	     R  W  X   R  W  X   R  W  X
//
// So: group bits shift left by 3 to land on User, others bits shift left by 6.
func EffectiveBits(user *models.User, ownerID *int64, groupID *int64, mode uint16) uint16 {
	if user == nil {
		return 0
	}
	if user.IsAdmin {
		return UserR | UserW | UserX
	}
	if ownerID != nil && *ownerID == user.ID {
		return mode & (UserR | UserW | UserX)
	}
	if groupID != nil && containsID(user.GroupIDs, *groupID) {
		return (mode & (GroupR | GroupW | GroupX)) << 3
	}
	return (mode & (OthersR | OthersW | OthersX)) << 6
}

func containsID(ids []int64, id int64) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

// HasRead/HasWrite/HasExec inspect effective bits as computed above.
func HasRead(eff uint16) bool  { return eff&UserR != 0 }
func HasWrite(eff uint16) bool { return eff&UserW != 0 }
func HasExec(eff uint16) bool  { return eff&UserX != 0 }
