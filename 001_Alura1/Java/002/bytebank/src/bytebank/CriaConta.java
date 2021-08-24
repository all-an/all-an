package bytebank;

public class CriaConta {
	public static void main(String[] args) {
		Conta primeiraConta = new Conta(); //criando objeto
		primeiraConta.saldo = 200;
		System.out.println(primeiraConta.saldo);

		primeiraConta.saldo += 100;
		
		System.out.println(primeiraConta.saldo);
		
		Conta segundaConta = new Conta();
		segundaConta.saldo = 50;
		
		System.out.println("Saldo primeira conta: " + primeiraConta.saldo);
		System.out.println("Saldo segunda conta: " + segundaConta.saldo);
		
		System.out.println("Agencia : " + segundaConta.agencia);
		System.out.println("Numero da conta: " + segundaConta.numero);
		
		if(primeiraConta == segundaConta) { 
			System.out.println("Mesmas contas");
		} else {
			System.out.println("Contas diferentes");
		}
		System.out.println(primeiraConta);
		System.out.println(segundaConta); 
	}
}
