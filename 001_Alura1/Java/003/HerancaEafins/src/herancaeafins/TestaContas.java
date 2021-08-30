package herancaeafins;

public class TestaContas {
	public static void main(String[] args) {
		Conta conta = new Conta(1, 1);
		
		//conta inconsistente
		//conta.setAgencia(-200);
		//conta.setNumero(-100);
		
		System.out.println(conta.getAgencia());
		System.out.println(conta.getNumero());
		
		Conta conta2 = new Conta(1, 2);
		
        // System.out.println(Conta.total); // não compila devido ao total ser privado, retirando o privado ele compila
		
		System.out.println(Conta.getTotal());
	}

}