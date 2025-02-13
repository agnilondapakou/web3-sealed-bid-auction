import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("SealedBidAuction", function () {
  async function deployAuctionFixture() {
    const [owner, seller, bidder1, bidder2] = await hre.ethers.getSigners();

    const ERC20Mock = await hre.ethers.getContractFactory("ERC20Mock");
    const token = await ERC20Mock.deploy("PakouToken", "PTK", owner);
    await token.mint(bidder1.address, hre.ethers.parseEther("10000000"));
    await token.mint(bidder2.address, hre.ethers.parseEther("10000000"));

    const SealedBidAuction = await hre.ethers.getContractFactory("SealedBidAuction");
    const auction = await SealedBidAuction.deploy(token.target);

    return { auction, token, owner, seller, bidder1, bidder2 };
  }

  it("Should create an auction", async function () {
    const { auction, seller } = await loadFixture(deployAuctionFixture);

    const cautionCountBefore = await auction.auctionCounter();

    await auction.createAuction(1, hre.ethers.parseEther("10"), 3600, 1800);

    const cautionCountAfter = await auction.auctionCounter();

    expect(cautionCountBefore).to.be.lessThan(cautionCountAfter)
  });

  it("Should allow bidding", async function () {
    const { auction, token, bidder1 } = await loadFixture(deployAuctionFixture);
    await token.connect(bidder1).approve(auction.target, hre.ethers.parseEther("15"));
    
    const bidHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("15-secret"));
    await auction.connect(bidder1).submitBid(1, bidHash, hre.ethers.parseEther("15"));


  });

  it("Should allow revealing a bid", async function () {
    const { auction, token, bidder1 } = await loadFixture(deployAuctionFixture);
    await token.connect(bidder1).approve(auction.target, hre.ethers.parseEther("15"));
    const bidHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("15-secret"));
    await auction.connect(bidder1).submitBid(1, bidHash, hre.ethers.parseEther("15"));
    
    await time.increase(3600);
    await expect(
      auction.connect(bidder1).revealBid(1, hre.ethers.parseEther("15"), "15-secret")
    )
      .to.emit(auction, "BidRevealed")
      .withArgs(1, bidder1.address, hre.ethers.parseEther("15"));
  });

  it("Should determine the winner correctly", async function () {
    const { auction, token, bidder1, bidder2 } = await loadFixture(deployAuctionFixture);
    await token.connect(bidder1).approve(auction.target, hre.ethers.parseEther("10"));
    await token.connect(bidder2).approve(auction.target, hre.ethers.parseEther("20"));
    
    const bidHash1 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("10-secret"));
    const bidHash2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("20-secret"));
    await auction.connect(bidder1).submitBid(1, bidHash1, hre.ethers.parseEther("10"));
    await auction.connect(bidder2).submitBid(1, bidHash2, hre.ethers.parseEther("20"));
    
    await time.increase(3600);
    await auction.connect(bidder1).revealBid(1, hre.ethers.parseEther("10"), "10-secret");
    await auction.connect(bidder2).revealBid(1, hre.ethers.parseEther("20"), "20-secret");
    
    await time.increase(1800);
    await expect(auction.determineWinner(1)).not.to.be.reverted;
  });

  it("Should finalize the auction and transfer funds", async function () {
    const { auction, token, bidder2, seller } = await loadFixture(deployAuctionFixture);
    await token.connect(bidder2).approve(auction.target, hre.ethers.parseEther("20"));
    const bidHash2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("20-secret"));
    await auction.connect(bidder2).submitBid(1, bidHash2, hre.ethers.parseEther("20"));
    
    await time.increase(3600);
    await auction.connect(bidder2).revealBid(1, hre.ethers.parseEther("20"), "20-secret");
    
    await time.increase(1800);
    await auction.determineWinner(1);
    await expect(auction.finalizeAuction(1)).not.to.be.reverted;
    expect(await token.balanceOf(seller.address)).to.equal(hre.ethers.parseEther("20"));
  });
});
