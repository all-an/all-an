package bytebank;

public class TesteReferencia {
	public static void main(String[] args) {
		Conta primeiraConta = new Conta();
		primeiraConta.saldo = 300;
		
		System.out.println("Saldo primera conta é " + primeiraConta.saldo);

		Conta segundaConta = primeiraConta; //referenciando objetos
		
		System.out.println("Saldo segunda conta: " + segundaConta.saldo);

	
		segundaConta.saldo += 100;
		
		System.out.println("Saldo segunda conta: " + segundaConta.saldo);
		
		if(primeiraConta == segundaConta) {
			System.out.println("Mesmas contas");
		} else {
			System.out.println("Contas diferentes");
		}
		
		System.out.println(primeiraConta);
		System.out.println(segundaConta);
	}   

}
