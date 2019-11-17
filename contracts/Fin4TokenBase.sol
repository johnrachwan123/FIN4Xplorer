pragma solidity ^0.5.0;

import 'contracts/Fin4Proofing.sol';
import "contracts/proof/Fin4BaseProofType.sol";
import "contracts/stub/Fin4ClaimingStub.sol";

contract Fin4TokenBase { // abstract class

  address public Fin4ClaimingAddress;
  address public Fin4ProofingAddress;
  address public tokenCreator;
  string public description;
  string public actionsText;
  string public unit; // TODO remove? repurpose?
  uint public tokenCreationTime;
  bool private initDone = false;
  uint public fixedQuantity;
  uint public userDefinedQuantityFactor;

  constructor() public {
    tokenCreationTime = now;
  }

  function init(address Fin4ClaimingAddr, address Fin4ProofingAddr, string memory _description,
    string memory _actionsText, address _tokenCreator, uint _fixedQuantity, uint _userDefinedQuantityFactor) public {
    require(!initDone, "init() can only be called once"); // TODO also require token creator?
    Fin4ClaimingAddress = Fin4ClaimingAddr;
    Fin4ProofingAddress = Fin4ProofingAddr;
    description = _description;
    actionsText = _actionsText;
    tokenCreator = _tokenCreator;
    fixedQuantity = _fixedQuantity;
    userDefinedQuantityFactor = _userDefinedQuantityFactor;
    initDone = true;
  }

  function name() public view returns(string memory);
  function symbol() public view returns(string memory);

  // ------------------------- CLAIM -------------------------

  uint nextClaimId = 0;

	struct Claim {
    uint claimId;
    address claimer;
    bool isApproved;
    uint quantity;
    // uint timeGivenByUser; // TODO if useful? #ConceptualDecision
    string comment;
    address[] requiredProofTypes;
    mapping(address => bool) proofStatuses;
    mapping(address => uint) proofInteractionTimes;
    uint claimCreationTime;
    uint claimApprovalTime;
    bool gotRejected;
    address[] rejectedByProofTypes;
  }

	mapping (uint => Claim) public claims;

  // intentional forwarding like this so that the front end doesn't need to know which token to submit a claim to at the moment of submitting it
	function submitClaim(address claimer, uint quantity, string memory comment) public returns (uint, address[] memory, uint) {
    Claim storage claim = claims[nextClaimId];
    claim.claimCreationTime = now;
    claim.claimId = nextClaimId;
    claim.claimer = claimer;
    claim.quantity = quantity;
    claim.comment = comment;
    // make a deep copy because the token creator might change the required proof types, but throughout the lifecycle of a claim they should stay fix
    // TODO should they? --> #ConceptualDecision
    claim.requiredProofTypes = getRequiredProofTypes();
    // initialize all the proofs required by the token creator with false
    // TODO isn't the default initialization false?
    for (uint i = 0; i < claim.requiredProofTypes.length; i ++) {
      claim.proofStatuses[claim.requiredProofTypes[i]] = false;
    }
    claim.isApproved = false;
    claim.gotRejected = false;

    if (claim.requiredProofTypes.length == 0) {
      approveClaim(nextClaimId);
    }

    nextClaimId ++;
    return (nextClaimId - 1, claim.requiredProofTypes, claim.claimCreationTime);
  }

  function getClaim(uint claimId) public view returns(address, bool, uint, uint, string memory, address[] memory, bool[] memory) {
    // require(claims[claimId].claimer == msg.sender, "This claim was not submitted by the sender");

    Claim storage claim = claims[claimId];
    // This assumes the proof types are still the same as when the claim was submitted
    // We probably want to support an evolving set of proof types though? TODO
    address[] memory requiredProofTypes = getRequiredProofTypes();
    bool[] memory proofTypeStatuses = new bool[](requiredProofTypes.length);
    for (uint i = 0; i < requiredProofTypes.length; i ++) {
      proofTypeStatuses[i] = claim.proofStatuses[requiredProofTypes[i]];
    }

    return (claim.claimer, claim.isApproved, claim.quantity, claim.claimCreationTime, claim.comment, requiredProofTypes, proofTypeStatuses);
  }

  function getClaimInfo(uint claimId) public view returns(address, bool, uint, uint, string memory) {
    return (claims[claimId].claimer, claims[claimId].isApproved,
      claims[claimId].quantity, claims[claimId].claimCreationTime, claims[claimId].comment);
  }

  function getClaimIds(address claimer) public view returns(uint[] memory) {
    uint count = 0;
    for (uint i = 0; i < nextClaimId; i ++) {
      if (claims[i].claimer == claimer) {
          count ++;
      }
    }
    uint[] memory ids = new uint[](count);
    count = 0;
    for (uint i = 0; i < nextClaimId; i ++) {
      if (claims[i].claimer == claimer) {
          ids[count] = i;
          count ++;
      }
    }
    return ids;
  }

  // ------------------------- METHODS USED BY PROOF TYPES -------------------------

  // Used by the MinimumInterval proof type
  function getTimeBetweenThisClaimAndThatClaimersPreviousOne(address claimer, uint claimId) public view returns(uint) {
    uint[] memory ids = getClaimIds(claimer);
    if (ids.length < 2 || ids[0] == claimId) {
      return 365 * 24 * 60 * 60 * 1000; // a year as indicator that it's not applicable (can't do -1 unfortunately)
    }
    uint previousId;
    for (uint i = 0; i < ids.length; i ++) {
      if(ids[i] == claimId) {
          return claims[claimId].claimCreationTime - claims[previousId].claimCreationTime;
      }
      previousId = ids[i];
    }
  }

  // Used by the MaximumQuantityPerInterval proof type
  function sumUpQuantitiesWithinIntervalBeforeThisClaim(address claimer, uint claimId, uint interval) public view returns(uint, uint) {
    uint[] memory ids = getClaimIds(claimer);
    if (ids.length < 2 || ids[0] == claimId) {
      return (0, claims[claimId].quantity);
    }

    uint dateOfRequestingClaim = claims[claimId].claimCreationTime; // TODO check if that's actually the claimers claim
    uint sum = 0;

    for (uint i = 0; i < ids.length; i ++) {
      if (ids[i] != claimId && dateOfRequestingClaim - claims[ids[i]].claimCreationTime <= interval) {
          sum = sum + claims[ids[i]].quantity;
      }
    }

    return (sum, claims[claimId].quantity);
  }

  // ------------------------- PROOF TYPES -------------------------

  address[] public requiredProofTypes; // a subset of all existing ones linked to Fin4Main, defined by the token creator

  // called from ProofType contracts
  function receiveProofApproval(address proofTypeAddress, uint claimId) public {
    // TODO require something as guard?
    claims[claimId].proofStatuses[proofTypeAddress] = true;
    claims[claimId].proofInteractionTimes[proofTypeAddress] = now;
    Fin4ClaimingStub(Fin4ClaimingAddress).proofApprovalPingback(address(this), proofTypeAddress, claimId, claims[claimId].claimer);
    if (_allProofTypesApprovedOnClaim(claimId)) {
      approveClaim(claimId);
    }
  }

  function receiveProofRejection(address proofTypeAddress, uint claimId) public {
    // can there be multiple interaction times per proof type?
    claims[claimId].proofInteractionTimes[proofTypeAddress] = now;
    // also store reason here? Or enough to send as message to the user from the proof type as is done currently?
    claims[claimId].rejectedByProofTypes.push(proofTypeAddress);
    if (!claims[claimId].gotRejected) {
      claims[claimId].gotRejected = true;
      Fin4ClaimingStub(Fin4ClaimingAddress).proofAndClaimRejectionPingback(address(this), claimId, claims[claimId].claimer);
    }
  }

  function approveClaim(uint claimId) private {
    claims[claimId].isApproved = true;
    claims[claimId].claimApprovalTime = now;

    uint quantity;

    // a require() in Fin4TokenManagement.createNewToken() made sure they are not both zero or nonzero

    if (fixedQuantity != 0) {
      quantity = fixedQuantity;
    }

    if (userDefinedQuantityFactor != 0) {
      quantity = claims[claimId].quantity * userDefinedQuantityFactor;
    }

    Fin4ClaimingStub(Fin4ClaimingAddress).claimApprovedPingback(address(this), claims[claimId].claimer, claimId, quantity);
  }

  function isMinter(address account) public view returns (bool);

  function addMinter(address account) public;

  function renounceMinter() public;

  function mint(address account, uint256 amount) public returns (bool);

  function _allProofTypesApprovedOnClaim(uint claimId) private view returns(bool) {
    for (uint i = 0; i < requiredProofTypes.length; i ++) {
      if (!claims[claimId].proofStatuses[requiredProofTypes[i]]) {
        return false;
      }
    }
    return true;
  }

  function getRequiredProofTypes() public view returns(address[] memory) {
    return requiredProofTypes;
  }

  // called for each proof type from Fin4Main.createNewToken()
  function addRequiredProofType(address proofType) public returns(bool) {
    require(Fin4Proofing(Fin4ProofingAddress).proofTypeIsRegistered(proofType),
      "This address is not registered as proof type in Fin4Proofing");
    requiredProofTypes.push(proofType);
    Fin4BaseProofType(proofType).registerTokenCreator(tokenCreator);
    return true;
  }

}
