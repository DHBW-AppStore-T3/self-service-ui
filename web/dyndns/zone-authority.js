// What the caller may do with a zone they own, as the server decides it: the creator (or a super admin) deletes the zone, removes other owners and rotates every owner's key; any other owner only leaves and rotates their own key. The creator cannot leave — they delete instead. The UI only hides what the server would refuse; the server stays the one that enforces it.
//
// `me` is the identity the requests act as (GET /v1/me, so acting for somebody counts as being them). A zone without a creator (a server from before the creator existed) is treated as before: every owner manages it.
export function zoneAuthority({ owners = [], creator = '' } = {}, me = '', superAdmin = false) {
    const self = (me || '').toLowerCase();
    const isCreator = !!creator && creator.toLowerCase() === self;
    const manages = superAdmin || isCreator || !creator;
    return {
        isCreator,
        manages,
        // Leaving needs somebody else to stay behind, and is not for the creator.
        canLeave: !isCreator && owners.length > 1 && owners.some(o => o.toLowerCase() === self),
        // Removing an owner other than oneself; oneself goes through leaving.
        canRemove: (owner) => manages && owner.toLowerCase() !== self && owners.length > 1,
        // Rotating everybody's key only means something when there is somebody else.
        rotatesAll: manages && owners.length > 1,
    };
}
