using System;

namespace CalculaPoupanca2
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Executando Projeto 11!");

            double valorInvestido = 1000;
            string mes;

            for (int contadorMes = 1; contadorMes <= 12; contadorMes++)
            {
                valorInvestido *= 1.0036;
                if (contadorMes > 1)
                {
                    mes = " meses ";
                } else
                {
                    mes = " mês ";
                }
                Console.WriteLine("Após " + contadorMes + mes + " você terá R$ " + valorInvestido);
            }

            Console.ReadLine();
        }
    }
}
